import Foundation
import ARKit
import AVFoundation
import Capacitor

// Augmented reality of the iOS app. WKWebView has no WebXR, so ARKit runs
// here: the camera image is shown natively behind a transparent web view and
// every ARFrame sends the page the device's pose and the projection that
// matches the image. The page draws the game over it with three.js.
//
// The page draws a frame or two after the pose it used was captured. To keep
// the game still on the real world, the image shown is the one of that pose:
// the page reports each frame it drew (shown) and CameraView puts up the
// camera image with that timestamp.
//
// Two modes: "table" (the map as a miniature on a surface) and "room" (the
// room scanned, see RoomScan, becomes the battlefield).
@objc(ArPlugin)
public class ArPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "ArPlugin"
    public let jsName = "FieldAR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "finishScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shown", returnType: CAPPluginReturnNone)
    ]

    private var session: ARSession?
    private var cameraView: CameraView?
    private var mode = "table"
    private var placing = true
    private var scanning = false
    private var scanBusy = false
    private var lastScan: TimeInterval = 0
    private var gridYaw: Float?
    private var roomAnchor: ARAnchor?
    private var saved: (opaque: Bool, background: UIColor?, scroll: UIColor?)?
    private let scanQueue = DispatchQueue(label: "com.aerofred.fieldwarfare.scan", qos: .userInitiated)

    private static var lidar: Bool { ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }

    // MARK: Page API

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["supported": ARWorldTrackingConfiguration.isSupported, "lidar": ArPlugin.lidar])
    }

    // Asks for the camera the first time, then starts the session. Rejects
    // with DENIED when the camera is refused, UNSUPPORTED without ARKit.
    @objc func start(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.reject("data.ar.native.unsupported", "UNSUPPORTED")
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            DispatchQueue.main.async { self.begin(call) }
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted { self.begin(call) } else { self.denied(call) }
                }
            }
        default:
            denied(call)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardown()
            call.resolve()
        }
    }

    // mode: "table" or "room" (a room starts a fresh scan); placing: look for
    // a horizontal surface under the screen's centre; scanning: resume the
    // scan of the room.
    @objc func configure(_ call: CAPPluginCall) {
        let mode = call.getString("mode"), placing = call.getBool("placing"), scanning = call.getBool("scanning")
        DispatchQueue.main.async {
            if let placing { self.placing = placing }
            if let mode, mode == "table" || mode == "room", mode != self.mode || mode == "room" {
                self.mode = mode
                self.scanning = mode == "room"
                self.gridYaw = nil
                self.forgetRoom()
                self.run(options: [.removeExistingAnchors])
            } else if let scanning, self.mode == "room", scanning != self.scanning {
                self.scanning = scanning
                if scanning { self.forgetRoom() }
                self.run(options: [])
            }
        }
    }

    // Ends the scan: the final grid, the LiDAR mesh when there is one, and an
    // anchor at the grid's origin that ARKit keeps on the real floor.
    @objc func finishScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.mode == "room", let session = self.session, let frame = session.currentFrame else {
                call.reject("data.ar.native.noImage")
                return
            }
            let anchors = frame.anchors, camera = ArPlugin.position(frame.camera.transform), yaw = self.gridYaw
            self.scanQueue.async {
                guard let grid = RoomScan.grid(anchors: anchors, camera: camera, yaw: yaw) else {
                    DispatchQueue.main.async { call.reject("data.ar.native.noFloor", "NO_FLOOR") }
                    return
                }
                let mesh = RoomScan.mesh(anchors: anchors, floor: grid.floor)
                DispatchQueue.main.async {
                    self.scanning = false
                    self.gridYaw = grid.yaw
                    self.run(options: [])
                    self.forgetRoom()
                    let anchor = ARAnchor(name: "field-warfare-room", transform: RoomScan.originTransform(floor: grid.floor, yaw: grid.yaw))
                    session.add(anchor: anchor)
                    self.roomAnchor = anchor
                    var result = grid.dictionary
                    if let mesh { result["mesh"] = mesh }
                    call.resolve(result)
                }
            }
        }
    }

    // The page drew the pose of this frame: show its camera image.
    @objc func shown(_ call: CAPPluginCall) {
        guard let t = call.getDouble("t") else { return }
        DispatchQueue.main.async { self.cameraView?.show(timestamp: t) }
    }

    // MARK: Session

    private func denied(_ call: CAPPluginCall) {
        call.reject("data.ar.native.cameraDenied", "DENIED")
    }

    // A table needs horizontal surfaces. A room being scanned needs walls
    // too, and the LiDAR mesh where there is one; once scanned, nothing more
    // is looked for and the device only tracks.
    private func configuration() -> ARWorldTrackingConfiguration {
        let configuration = ARWorldTrackingConfiguration()
        configuration.isLightEstimationEnabled = true
        if mode == "room" {
            if scanning {
                configuration.planeDetection = [.horizontal, .vertical]
                if ArPlugin.lidar { configuration.sceneReconstruction = .mesh }
            }
        } else {
            configuration.planeDetection = [.horizontal]
        }
        return configuration
    }

    private func run(options: ARSession.RunOptions) { session?.run(configuration(), options: options) }

    private func forgetRoom() {
        if let anchor = roomAnchor { session?.remove(anchor: anchor) }
        roomAnchor = nil
    }

    private func begin(_ call: CAPPluginCall) {
        guard let webView = bridge?.webView, let host = webView.superview else {
            call.reject("data.ar.native.noView")
            return
        }
        if session == nil {
            let view = CameraView(frame: host.bounds)
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            host.insertSubview(view, belowSubview: webView)
            cameraView = view
            saved = (webView.isOpaque, webView.backgroundColor, webView.scrollView.backgroundColor)
            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear
            let session = ARSession()
            session.delegate = self
            self.session = session
        }
        mode = "table"
        placing = true
        scanning = false
        gridYaw = nil
        roomAnchor = nil
        run(options: [.resetTracking, .removeExistingAnchors])
        call.resolve(["lidar": ArPlugin.lidar])
    }

    private func teardown() {
        session?.pause()
        session?.delegate = nil
        session = nil
        roomAnchor = nil
        scanning = false
        cameraView?.removeFromSuperview()
        cameraView = nil
        if let webView = bridge?.webView, let saved {
            webView.isOpaque = saved.opaque
            webView.backgroundColor = saved.background
            webView.scrollView.backgroundColor = saved.scroll
        }
        saved = nil
    }

    // Pose in the orientation of the interface: x to the right of the
    // screen, y to its top, looking down -z, as a three.js camera. The
    // projection fills the web view as the image does (aspect fill); the
    // page sets its own near and far planes. In a scanned room, "g" is the
    // grid's origin as ARKit now places it.
    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let view = cameraView else { return }
        view.push(frame.capturedImage, timestamp: frame.timestamp)
        let orientation = view.interfaceOrientation
        let size = view.bounds.size
        guard size.width > 0, size.height > 0 else { return }
        let camera = frame.camera
        var data: [String: Any] = [
            "t": frame.timestamp,
            "m": ArPlugin.elements(camera.viewMatrix(for: orientation).inverse),
            "p": ArPlugin.elements(camera.projectionMatrix(for: orientation, viewportSize: size, zNear: 0.01, zFar: 100)),
            "s": ArPlugin.state(camera.trackingState)
        ]
        if mode == "table", placing, case .normal = camera.trackingState, let hit = centreHit(frame, session) {
            data["h"] = [hit.x, hit.y, hit.z]
        }
        if let room = roomAnchor, let anchor = frame.anchors.first(where: { $0.identifier == room.identifier }) {
            data["g"] = ArPlugin.elements(anchor.transform)
        }
        if let light = frame.lightEstimate { data["l"] = Double(light.ambientIntensity) }
        notifyListeners("frame", data: data)
        if mode == "room", scanning { scan(frame) }
    }

    // While scanning, the grid goes to the page every 0.75 s for its preview,
    // worked out away from the main thread.
    private func scan(_ frame: ARFrame) {
        guard !scanBusy, frame.timestamp - lastScan > 0.75 else { return }
        scanBusy = true
        lastScan = frame.timestamp
        let anchors = frame.anchors, camera = ArPlugin.position(frame.camera.transform), yaw = gridYaw
        scanQueue.async {
            let grid = RoomScan.grid(anchors: anchors, camera: camera, yaw: yaw)
            DispatchQueue.main.async {
                self.scanBusy = false
                guard self.scanning, self.mode == "room" else { return }
                if let grid, grid.locked, self.gridYaw == nil { self.gridYaw = grid.yaw }
                self.notifyListeners("room", data: grid?.dictionary ?? ["floor": NSNull()])
            }
        }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        notifyListeners("failure", data: ["message": error.localizedDescription])
    }

    public func sessionWasInterrupted(_ session: ARSession) {
        notifyListeners("frame", data: ["s": "interrupted"])
    }

    // The table under the centre of the screen, which is the centre of the
    // camera image: a detected plane first, an estimated one otherwise.
    private func centreHit(_ frame: ARFrame, _ session: ARSession) -> simd_float3? {
        let centre = CGPoint(x: 0.5, y: 0.5)
        for target in [ARRaycastQuery.Target.existingPlaneGeometry, .estimatedPlane] {
            let query = frame.raycastQuery(from: centre, allowing: target, alignment: .horizontal)
            if let result = session.raycast(query).first { return ArPlugin.position(result.worldTransform) }
        }
        return nil
    }

    private static func position(_ m: simd_float4x4) -> simd_float3 { simd_float3(m.columns.3.x, m.columns.3.y, m.columns.3.z) }

    // Column-major, as three.js's Matrix4.fromArray reads it.
    private static func elements(_ m: simd_float4x4) -> [Float] {
        let c = m.columns
        return [c.0.x, c.0.y, c.0.z, c.0.w, c.1.x, c.1.y, c.1.z, c.1.w, c.2.x, c.2.y, c.2.z, c.2.w, c.3.x, c.3.y, c.3.z, c.3.w]
    }

    private static func state(_ state: ARCamera.TrackingState) -> String {
        switch state {
        case .normal: return "normal"
        case .notAvailable: return "unavailable"
        case .limited(let reason):
            switch reason {
            case .initializing: return "initializing"
            case .excessiveMotion: return "motion"
            case .insufficientFeatures: return "features"
            case .relocalizing: return "relocalizing"
            @unknown default: return "limited"
            }
        }
    }
}
