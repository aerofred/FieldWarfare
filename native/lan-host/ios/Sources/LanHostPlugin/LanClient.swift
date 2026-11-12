import Foundation
import Network
import CryptoKit

// One TCP connection of the local server: a single HTTP request, or a
// WebSocket after an upgrade on /multiplayer (RFC 6455; text messages of at
// most 4 KB and a 256 KB send queue, like the Node server).
final class LanClient {
    let id: Int
    private let connection: NWConnection
    private weak var host: LanHostPlugin?
    private var buffer = Data()
    private(set) var upgraded = false
    private var responding = false
    private var finished = false
    private var queued = 0
    private var message = Data()
    private var messageBinary = false

    init(id: Int, connection: NWConnection, host: LanHostPlugin) {
        self.id = id
        self.connection = connection
        self.host = host
    }

    func start(on queue: DispatchQueue) {
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.finish()
            default: break
            }
        }
        connection.start(queue: queue)
        receive()
    }

    func send(text: String) {
        guard upgraded else { return }
        write(Self.frame(0x1, Array(text.utf8)))
    }

    func close(code: UInt16, reason: String) {
        guard !finished else { return }
        guard upgraded else { finish(); return }
        let payload = [UInt8(code >> 8), UInt8(code & 0xFF)] + Array(reason.utf8.prefix(120))
        write(Self.frame(0x8, payload)) { [weak self] in self?.finish() }
    }

    func finish() {
        guard !finished else { return }
        finished = true
        connection.cancel()
        host?.closed(self)
    }

    func reply(_ status: Int, type: String, body: Data, head: Bool, cors: Bool = false) {
        let reason = [200: "OK", 404: "Not Found", 405: "Method Not Allowed"][status] ?? "OK"
        var text = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n"
        if cors { text += "Access-Control-Allow-Origin: *\r\n" }
        var data = Data((text + "\r\n").utf8)
        if !head { data.append(body) }
        write(data, limited: false) { [weak self] in self?.finish() }
    }

    // MARK: Reading

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, error in
            guard let self, !self.finished else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                if self.upgraded { self.readFrames() } else if !self.responding { self.readRequest() }
            }
            if complete || error != nil { self.finish() } else if !self.finished { self.receive() }
        }
    }

    private func readRequest() {
        guard let end = buffer.range(of: Data("\r\n\r\n".utf8)) else {
            if buffer.count > 16_384 { finish() }
            return
        }
        let head = String(decoding: buffer[buffer.startIndex..<end.lowerBound], as: UTF8.self)
        buffer = Data(buffer[end.upperBound...])
        var lines = head.components(separatedBy: "\r\n")
        let request = lines.removeFirst().split(separator: " ")
        guard request.count >= 2 else { finish(); return }
        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let target = request[1].split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
        let path = String(target).removingPercentEncoding ?? "/"
        if path == "/multiplayer", headers["upgrade"]?.lowercased() == "websocket", let key = headers["sec-websocket-key"] {
            upgrade(key: key)
        } else {
            responding = true
            host?.respond(self, method: String(request[0]), path: path)
        }
    }

    private func upgrade(key: String) {
        let digest = Insecure.SHA1.hash(data: Data((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8))
        write(Data("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(Data(digest).base64EncodedString())\r\n\r\n".utf8))
        upgraded = true
        host?.opened(self)
        readFrames()
    }

    private func readFrames() {
        while !finished {
            let bytes = [UInt8](buffer)
            guard bytes.count >= 2 else { return }
            let fin = bytes[0] & 0x80 != 0, opcode = bytes[0] & 0x0F, masked = bytes[1] & 0x80 != 0
            var length = Int(bytes[1] & 0x7F), offset = 2
            if length == 126 {
                guard bytes.count >= 4 else { return }
                length = Int(bytes[2]) << 8 | Int(bytes[3])
                offset = 4
            } else if length == 127 {
                close(code: 1009, reason: "Message trop long")
                return
            }
            guard masked else { close(code: 1002, reason: "Unmasked frame"); return }
            guard length <= 4096 else { close(code: 1009, reason: "Message trop long"); return }
            guard bytes.count >= offset + 4 + length else { return }
            let mask = Array(bytes[offset..<offset + 4])
            offset += 4
            var payload = [UInt8](repeating: 0, count: length)
            for i in 0..<length { payload[i] = bytes[offset + i] ^ mask[i % 4] }
            buffer = Data(bytes[(offset + length)...])
            switch opcode {
            case 0x0, 0x1, 0x2:
                if opcode != 0x0 { message = Data(); messageBinary = opcode == 0x2 }
                message.append(contentsOf: payload)
                guard message.count <= 4096 else { close(code: 1009, reason: "Message trop long"); return }
                if fin {
                    host?.received(self, text: String(decoding: message, as: UTF8.self), binary: messageBinary)
                    message = Data()
                }
            case 0x8:
                close(code: 1000, reason: "")
                return
            case 0x9:
                write(Self.frame(0xA, payload))
            case 0xA:
                break
            default:
                close(code: 1002, reason: "Trame inconnue")
                return
            }
        }
    }

    // MARK: Writing

    private func write(_ data: Data, limited: Bool = true, then done: (() -> Void)? = nil) {
        guard !finished else { return }
        queued += data.count
        // A reader this far behind is dropped rather than buffered without end.
        if limited && queued > 256 * 1024 { finish(); return }
        connection.send(content: data, completion: .contentProcessed { [weak self] _ in
            self?.queued -= data.count
            done?()
        })
    }

    static func frame(_ opcode: UInt8, _ payload: [UInt8]) -> Data {
        var out: [UInt8] = [0x80 | opcode]
        if payload.count < 126 {
            out.append(UInt8(payload.count))
        } else if payload.count < 65536 {
            out += [126, UInt8(payload.count >> 8), UInt8(payload.count & 0xFF)]
        } else {
            out.append(127)
            for shift in stride(from: 56, through: 0, by: -8) { out.append(UInt8((payload.count >> shift) & 0xFF)) }
        }
        return Data(out + payload)
    }
}
