import UIKit
import AVFoundation
import CoreMedia

// The camera image behind the web view. ARKit's captured images (YCbCr, in
// the sensor's landscape orientation) go straight to a sample buffer layer,
// turned for the interface and filling the view as ARKit's projection
// expects (aspect fill, centred).
//
// The few latest images wait here: the page reports the timestamp of the
// pose it drew and the image of that pose goes up, so the camera and the
// game stay in step even when the page runs below the camera's 60 fps.
// Without word from the page (before its first frame, or while it stalls),
// the camera runs live.
final class CameraView: UIView {
    // ARKit recycles a small pool of image buffers: keeping too many stalls
    // the camera. Six frames are 100 ms at 60 fps.
    private static let keep = 6
    private static let liveAfter: CFTimeInterval = 0.25

    private let display = AVSampleBufferDisplayLayer()
    private var frames: [(t: TimeInterval, buffer: CVPixelBuffer)] = []
    private var shownTimestamp: TimeInterval = -1
    private var lastReport: CFTimeInterval = 0
    private var format: CMVideoFormatDescription?
    private var laidOut: UIInterfaceOrientation = .unknown

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        isUserInteractionEnabled = false
        display.videoGravity = .resizeAspectFill
        layer.addSublayer(display)
    }

    required init?(coder: NSCoder) { nil }

    var interfaceOrientation: UIInterfaceOrientation {
        window?.windowScene?.interfaceOrientation ?? .landscapeRight
    }

    // The sensor's image is upright in landscape right; a turn of the
    // interface turns the layer the other way round. UIKit angles turn
    // clockwise.
    override func layoutSubviews() {
        super.layoutSubviews()
        let orientation = interfaceOrientation
        laidOut = orientation
        let angle: CGFloat
        switch orientation {
        case .landscapeLeft: angle = .pi
        case .portrait: angle = .pi / 2
        case .portraitUpsideDown: angle = -.pi / 2
        default: angle = 0
        }
        let b = bounds, upright = abs(angle) == .pi / 2
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        display.setAffineTransform(.identity)
        display.bounds = CGRect(x: 0, y: 0, width: upright ? b.height : b.width, height: upright ? b.width : b.height)
        display.position = CGPoint(x: b.midX, y: b.midY)
        display.setAffineTransform(CGAffineTransform(rotationAngle: angle))
        CATransaction.commit()
    }

    func push(_ buffer: CVPixelBuffer, timestamp: TimeInterval) {
        // A half turn (landscape left ↔ right) keeps the same bounds.
        if interfaceOrientation != laidOut { setNeedsLayout() }
        frames.append((timestamp, buffer))
        if frames.count > Self.keep { frames.removeFirst(frames.count - Self.keep) }
        if CACurrentMediaTime() - lastReport > Self.liveAfter { present(frames.count - 1) }
    }

    func show(timestamp: TimeInterval) {
        lastReport = CACurrentMediaTime()
        guard let index = frames.lastIndex(where: { $0.t <= timestamp + 0.0005 }) else { return }
        if frames[index].t != shownTimestamp { present(index) }
    }

    // Shows a waiting image and lets go of the older ones.
    private func present(_ index: Int) {
        let entry = frames[index]
        shownTimestamp = entry.t
        frames.removeFirst(index)
        enqueue(entry.buffer)
    }

    private func enqueue(_ buffer: CVPixelBuffer) {
        if format.map({ !CMVideoFormatDescriptionMatchesImageBuffer($0, imageBuffer: buffer) }) ?? true {
            var description: CMVideoFormatDescription?
            CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescriptionOut: &description)
            format = description
        }
        guard let format else { return }
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()), decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescription: format, sampleTiming: &timing, sampleBufferOut: &sample)
        guard let sample else { return }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true), CFArrayGetCount(attachments) > 0 {
            let dictionary = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(dictionary, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(), Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        }
        if #available(iOS 17.0, *) {
            let renderer = display.sampleBufferRenderer
            if renderer.status == .failed { renderer.flush() }
            renderer.enqueue(sample)
        } else {
            if display.status == .failed { display.flush() }
            display.enqueue(sample)
        }
    }
}
