import Foundation
import Network
import Capacitor

// Local network host of the iOS app. The game room runs in the web view
// (server/hub.js); this plugin gives it what Node gives the desktop app: a
// TCP listener speaking HTTP and WebSocket (/multiplayer, /api/server and the
// game files for browsers), plus the Bonjour announce and browse of
// _fieldwarfare._tcp shared with the Windows and macOS apps.
@objc(LanHostPlugin)
public class LanHostPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LanHostPlugin"
    public let jsName = "LanHost"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "advertise", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "browse", returnType: CAPPluginReturnPromise)
    ]

    static let serviceType = "_fieldwarfare._tcp"
    private let queue = DispatchQueue(label: "com.aerofred.fieldwarfare.lan")
    private let instanceId = String(UUID().uuidString.prefix(8)).lowercased()
    private var listener: NWListener?
    private var ready = false
    private var pendingStart: CAPPluginCall?
    private var port: UInt16 = 4173
    private var service: NWListener.Service?
    private var clients: [Int: LanClient] = [:]
    private var nextClient = 0
    private var status = Data("{}".utf8)
    private var events: [[String: Any]] = []
    private var flushPending = false
    private var browser: NWBrowser?
    private var servers: [NWEndpoint: [String: String]] = [:]
    private lazy var webRoot: URL? = Bundle.main.url(forResource: "public", withExtension: nil)?.standardizedFileURL

    // MARK: Page API

    @objc func start(_ call: CAPPluginCall) {
        let requested = UInt16(clamping: call.getInt("port") ?? 4173)
        queue.async {
            if self.listener != nil && self.ready { call.resolve(self.startResult()); return }
            // A start still pending (the page gave up waiting): begin again.
            self.stopListener()
            self.pendingStart?.reject("Local server restarted.")
            self.pendingStart = nil
            self.listen(on: requested, call: call)
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        let messages = call.getArray("messages", JSObject.self) ?? []
        queue.async {
            for message in messages {
                guard let id = (message["id"] as? NSNumber)?.intValue, let text = message["data"] as? String else { continue }
                self.clients[id]?.send(text: text)
            }
        }
        call.resolve()
    }

    // Without a code the connection is dropped at once (terminate).
    @objc func close(_ call: CAPPluginCall) {
        let id = call.getInt("id") ?? -1, code = call.getInt("code"), reason = call.getString("reason") ?? ""
        queue.async {
            guard let client = self.clients[id] else { return }
            if let code { client.close(code: UInt16(clamping: code), reason: reason) } else { client.finish() }
        }
        call.resolve()
    }

    @objc func setStatus(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        queue.async { self.status = Data(json.utf8) }
        call.resolve()
    }

    // An empty host withdraws the announce.
    @objc func advertise(_ call: CAPPluginCall) {
        let host = call.getString("host") ?? "", version = call.getString("version") ?? ""
        queue.async {
            if host.isEmpty {
                self.service = nil
            } else {
                var txt = NWTXTRecord()
                txt["id"] = self.instanceId
                txt["v"] = version
                txt["host"] = host
                self.service = NWListener.Service(name: "Field Warfare (\(host))", type: Self.serviceType, domain: nil, txtRecord: txt)
            }
            self.listener?.service = self.service
        }
        call.resolve()
    }

    @objc func browse(_ call: CAPPluginCall) {
        queue.async {
            if self.browser == nil { self.startBrowser() }
            self.publishServers()
        }
        call.resolve()
    }

    // MARK: Listener

    private func startResult() -> [String: Any] {
        return ["port": Int(port), "addresses": Self.addresses(port)]
    }

    private func listen(on requested: UInt16, call: CAPPluginCall?) {
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        let listener: NWListener
        do {
            listener = try requested == 0 ? NWListener(using: parameters) : NWListener(using: parameters, on: NWEndpoint.Port(rawValue: requested) ?? .any)
        } catch {
            call?.reject("Serveur local indisponible : \(error.localizedDescription)")
            return
        }
        pendingStart = call
        listener.service = service
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.stateUpdateHandler = { [weak self, weak listener] state in
            guard let self, let listener, self.listener === listener else { return }
            switch state {
            case .ready:
                self.ready = true
                self.port = listener.port?.rawValue ?? requested
                self.pendingStart?.resolve(self.startResult())
                self.pendingStart = nil
            case .waiting(let error):
                // No usable network yet: the page asks again later.
                guard let call = self.pendingStart else { break }
                self.pendingStart = nil
                self.stopListener()
                call.reject("Serveur local indisponible : \(error.localizedDescription)")
            case .failed:
                self.stopListener()
                if let call = self.pendingStart {
                    self.pendingStart = nil
                    // Port taken: any free port still lets this device host.
                    if requested != 0 { self.listen(on: 0, call: call) } else { call.reject("Serveur local indisponible.") }
                } else {
                    // The system may tear the listener down while the app is in the background.
                    let port = self.port
                    self.queue.asyncAfter(deadline: .now() + 1) { if self.listener == nil { self.listen(on: port, call: nil) } }
                }
            default:
                break
            }
        }
        self.listener = listener
        listener.start(queue: queue)
    }

    private func stopListener() {
        listener?.cancel()
        listener = nil
        ready = false
    }

    private func accept(_ connection: NWConnection) {
        nextClient += 1
        let client = LanClient(id: nextClient, connection: connection, host: self)
        clients[client.id] = client
        client.start(on: queue)
    }

    // MARK: Client callbacks (on the plugin queue)

    func opened(_ client: LanClient) { emit(["t": "o", "id": client.id]) }
    func received(_ client: LanClient, text: String, binary: Bool) { emit(["t": "m", "id": client.id, "data": text, "binary": binary]) }
    func closed(_ client: LanClient) {
        clients.removeValue(forKey: client.id)
        if client.upgraded { emit(["t": "c", "id": client.id]) }
    }

    func respond(_ client: LanClient, method: String, path: String) {
        let head = method == "HEAD"
        guard method == "GET" || head else { client.reply(405, type: "text/plain", body: Data(), head: false); return }
        if path == "/api/server" { client.reply(200, type: "application/json", body: status, head: head, cors: true); return }
        // The game files bundled in the app, for players joining from a browser.
        if let root = webRoot {
            let file = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).standardizedFileURL
            if file.path.hasPrefix(root.path + "/"), let body = try? Data(contentsOf: file) {
                client.reply(200, type: Self.mime(file.pathExtension), body: body, head: head)
                return
            }
        }
        client.reply(404, type: "text/plain", body: Data("Not found".utf8), head: head)
    }

    // Events reach the page in order, batched every few milliseconds.
    private func emit(_ event: [String: Any]) {
        events.append(event)
        if flushPending { return }
        flushPending = true
        queue.asyncAfter(deadline: .now() + .milliseconds(4)) {
            self.flushPending = false
            let batch = self.events
            self.events.removeAll()
            self.notifyListeners("events", data: ["events": batch])
        }
    }

    // MARK: Browse

    private func startBrowser() {
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: Self.serviceType, domain: nil), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] _, changes in
            guard let self else { return }
            for change in changes {
                switch change {
                case .added(let result): self.resolve(result)
                case .changed(old: _, new: let result, flags: _): self.resolve(result)
                case .removed(let result): self.servers.removeValue(forKey: result.endpoint)
                default: break
                }
            }
            self.publishServers()
        }
        browser.stateUpdateHandler = { [weak self] state in
            if case .failed = state { self?.browser?.cancel(); self?.browser = nil }
        }
        self.browser = browser
        browser.start(queue: queue)
    }

    // A short connection to the announced service gives its IPv4 address.
    private func resolve(_ result: NWBrowser.Result) {
        guard case let .service(name, _, _, _) = result.endpoint else { return }
        var txt: [String: String] = [:]
        if case let .bonjour(record) = result.metadata { txt = record.dictionary }
        if txt["id"] == instanceId { return }
        let endpoint = result.endpoint
        let parameters = NWParameters.tcp
        if let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options { ip.version = .v4 }
        let connection = NWConnection(to: endpoint, using: parameters)
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                if let self, case let .hostPort(host, port)? = connection.currentPath?.remoteEndpoint, case let .ipv4(address) = host {
                    let ip = "\(address)".components(separatedBy: "%")[0]
                    self.servers[endpoint] = ["id": txt["id"] ?? name, "host": txt["host"] ?? name, "version": txt["v"] ?? "", "address": "http://\(ip):\(port.rawValue)"]
                    self.publishServers()
                }
                connection.cancel()
            case .failed, .waiting:
                connection.cancel()
            case .cancelled:
                connection.stateUpdateHandler = nil
            default:
                break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 5) { connection.cancel() }
    }

    private func publishServers() {
        notifyListeners("servers", data: ["servers": Array(servers.values)])
    }

    // MARK: Helpers

    static func addresses(_ port: UInt16) -> [String] {
        var result: [String] = []
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return result }
        defer { freeifaddrs(list) }
        for item in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(item.pointee.ifa_flags), name = String(cString: item.pointee.ifa_name)
            // Wi-Fi (en*) and the personal hotspot (bridge*), not cellular.
            guard let address = item.pointee.ifa_addr, address.pointee.sa_family == UInt8(AF_INET),
                  flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0,
                  name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(address, socklen_t(address.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                result.append("http://\(String(cString: host)):\(port)")
            }
        }
        return result
    }

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "woff2": return "font/woff2"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
