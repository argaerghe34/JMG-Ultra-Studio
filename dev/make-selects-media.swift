// make-selects-media.swift – extra deterministic test clips for the Selects checks (dev/test only, not shipped).
// Build & run:  swiftc -O dev/make-selects-media.swift -o /tmp/msm && /tmp/msm "$PWD/dev/test-media/selects" "$PWD/../IMG-20261019-WA0038.jpg"
// Writes 1920x1080 25 fps H.264 MP4s (no audio) plus truth.json. Uses only Apple frameworks; seeded RNG.
import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import ImageIO

let W = 1920, H = 1080, FPS = 25
let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { print("usage: msm <outDir> <faceImage.jpg>"); exit(1) }
let outDir = URL(fileURLWithPath: args[0]); let faceURL = URL(fileURLWithPath: args[1])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let bgra: UInt32 = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

struct RNG { var s: UInt64; mutating func next() -> Double { s &+= 0x9E3779B97F4A7C15; var z = s; z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; z ^= z >> 31; return Double(z >> 11) / Double(1 << 53) } }

// ---------- a detailed "venue" scene at 2x so moves stay sharp ----------
func makeScene() -> CGImage {
  let SW = 3840, SH = 2160
  let ctx = CGContext(data: nil, width: SW, height: SH, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: bgra)!
  var r = RNG(s: 42)
  let grad = CGGradient(colorsSpace: cs, colors: [CGColor(red: 0.12, green: 0.14, blue: 0.22, alpha: 1), CGColor(red: 0.45, green: 0.38, blue: 0.30, alpha: 1)] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(grad, start: .zero, end: CGPoint(x: 0, y: SH), options: [])
  for _ in 0..<420 {
    ctx.setFillColor(CGColor(red: r.next(), green: r.next(), blue: r.next(), alpha: 0.85))
    let w = 30 + r.next() * 260, h = 30 + r.next() * 260
    let rect = CGRect(x: r.next() * Double(SW), y: r.next() * Double(SH), width: w, height: h)
    if r.next() < 0.5 { ctx.fill(rect) } else { ctx.fillEllipse(in: rect) }
  }
  ctx.setStrokeColor(CGColor(gray: 0.95, alpha: 0.8)); ctx.setLineWidth(3)
  for x in stride(from: 0, to: SW, by: 48) { ctx.move(to: CGPoint(x: x, y: 0)); ctx.addLine(to: CGPoint(x: x + 300, y: SH)) }
  ctx.strokePath()
  for i in 0..<14 {
    let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 70 + CGFloat(i % 4) * 30, nil)
    let s = NSAttributedString(string: ["STAGE", "LIVE 2026", "ULTRA", "CROWD", "VENUE"][i % 5], attributes: [kCTFontAttributeName as NSAttributedString.Key: font, kCTForegroundColorAttributeName as NSAttributedString.Key: CGColor(gray: 1, alpha: 1)])
    let line = CTLineCreateWithAttributedString(s); ctx.textPosition = CGPoint(x: r.next() * 3400, y: r.next() * 2000); CTLineDraw(line, ctx)
  }
  return ctx.makeImage()!
}
let scene = makeScene()

// ---------- face composition (close-up talking head) ----------
func makeFaceFrame() -> CGImage {
  let src = CGImageSourceCreateWithURL(faceURL as CFURL, nil)!, img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
  let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: bgra)!
  ctx.setFillColor(CGColor(red: 0.16, green: 0.15, blue: 0.17, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
  // face box in the poster: x 444, y 545 (from top), 531x531 -> scale so the face is ~380 px tall, centred
  let sc = 380.0 / 531.0, iw = Double(img.width) * sc, ih = Double(img.height) * sc
  let fcx = (444 + 265.5) * sc, fcyTop = (545 + 265.5) * sc
  let x = 960 - fcx, yTop = 540 - fcyTop
  ctx.draw(img, in: CGRect(x: x, y: Double(H) - yTop - ih, width: iw, height: ih))
  return ctx.makeImage()!
}
let faceFrame = makeFaceFrame()

// ---------- writer ----------
func write(_ name: String, seconds: Double, draw: (CGContext, Double, Int) -> Void) {
  let url = outDir.appendingPathComponent(name)
  try? FileManager.default.removeItem(at: url)
  let w = try! AVAssetWriter(outputURL: url, fileType: .mp4)
  let inp = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 8_000_000, AVVideoMaxKeyFrameIntervalKey: FPS, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
  inp.expectsMediaDataInRealTime = false
  let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: inp, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
  w.add(inp); w.startWriting(); w.startSession(atSourceTime: .zero)
  let frames = Int(seconds * Double(FPS))
  for f in 0..<frames {
    while !inp.isReadyForMoreMediaData { usleep(1000) }
    var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, ad.pixelBufferPool!, &pb)
    CVPixelBufferLockBaseAddress(pb!, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: cs, bitmapInfo: bgra)!
    draw(ctx, Double(f) / Double(FPS), f)
    CVPixelBufferUnlockBaseAddress(pb!, [])
    ad.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: CMTimeScale(FPS)))
  }
  inp.markAsFinished()
  let sem = DispatchSemaphore(value: 0); w.finishWriting { sem.signal() }; sem.wait()
  print("wrote \(name) \(seconds)s")
}

/// draw the scene: view centre (cx, cy) in 2x-scene pixels, zoom (1 = 1:1 crop of the 2x scene), rotation degrees
func view(_ ctx: CGContext, cx: Double = 1920, cy: Double = 1080, zoom: Double = 1, rot: Double = 0) {
  ctx.saveGState()
  ctx.translateBy(x: Double(W) / 2, y: Double(H) / 2)
  ctx.rotate(by: rot * .pi / 180)
  ctx.scaleBy(x: zoom, y: zoom)
  ctx.translateBy(x: -cx, y: -(2160 - cy))
  ctx.interpolationQuality = .high
  ctx.draw(scene, in: CGRect(x: 0, y: 0, width: 3840, height: 2160))
  ctx.restoreGState()
}
/// multiply every pixel by per-channel gains (exposure / white balance)
func grade(_ ctx: CGContext, r: Double, g: Double, b: Double) {
  guard let data = ctx.data else { return }
  let p = data.bindMemory(to: UInt8.self, capacity: ctx.bytesPerRow * H), bpr = ctx.bytesPerRow
  for y in 0..<H { for x in 0..<W { let i = y * bpr + x * 4
    p[i] = UInt8(min(255, Double(p[i]) * b)); p[i + 1] = UInt8(min(255, Double(p[i + 1]) * g)); p[i + 2] = UInt8(min(255, Double(p[i + 2]) * r)) } }
}
func silhouette(_ ctx: CGContext, x: Double) {
  ctx.setFillColor(CGColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1))
  ctx.fillEllipse(in: CGRect(x: x - 110, y: 640, width: 220, height: 240))
  ctx.fill(CGRect(x: x - 210, y: -50, width: 420, height: 720))
}
let ss = { (x: Double) -> Double in let t = min(max(x, 0), 1); return t * t * (3 - 2 * t) }

var truth: [[String: Any]] = []
var rng = RNG(s: 7)

// S01 strobe: random 2-frame flashes about 3 times a second
var flashes = Set<Int>()
do { var f = 5; while f < 250 { flashes.insert(f); flashes.insert(f + 1); f += 5 + Int(rng.next() * 6) } }
write("S01_strobe.mp4", seconds: 10) { ctx, t, f in view(ctx); if flashes.contains(f) { grade(ctx, r: 2.4, g: 2.4, b: 2.4) } }
truth.append(["file": "S01_strobe.mp4", "expect": "flicker", "note": "2-frame flashes x2.4 brightness about 3-4 per second, static camera"])

write("S02_ae_pumping.mp4", seconds: 10) { ctx, t, _ in view(ctx); let g = 1 + 0.4 * sin(2 * .pi * t / 1.6); grade(ctx, r: g, g: g, b: g) }
truth.append(["file": "S02_ae_pumping.mp4", "expect": "exposure pumping", "note": "gain 0.6-1.4 sinusoid, period 1.6 s, static camera"])

write("S03_wb_shift.mp4", seconds: 10) { ctx, t, _ in view(ctx); let k = ss((t - 4) / 2); grade(ctx, r: 1 + 0.35 * k, g: 1, b: 1 - 0.4 * k) }
truth.append(["file": "S03_wb_shift.mp4", "expect": "colour shift 4-6 s", "note": "neutral until 4 s, warm cast (R x1.35, B x0.6) reached at 6 s, held"])

write("S04_walkthrough.mp4", seconds: 12) { ctx, t, _ in view(ctx); if t >= 4 && t <= 8 { silhouette(ctx, x: -250 + (t - 4) / 4 * 2420) } }
truth.append(["file": "S04_walkthrough.mp4", "expect": "activity 4-8 s", "note": "static camera, dark figure crosses the frame 4-8 s"])

write("S05_static_nothing.mp4", seconds: 20) { ctx, _, _ in view(ctx) }
truth.append(["file": "S05_static_nothing.mp4", "expect": "nothing happening", "note": "locked off, nothing moves for 20 s"])

write("S06_face_interview.mp4", seconds: 12) { ctx, _, _ in ctx.draw(faceFrame, in: CGRect(x: 0, y: 0, width: W, height: H)) }
truth.append(["file": "S06_face_interview.mp4", "expect": "face, close-up, static", "note": "face ~35 % of frame height, centred, locked off"])

write("S07_face_walkthrough.mp4", seconds: 12) { ctx, t, _ in ctx.draw(faceFrame, in: CGRect(x: 0, y: 0, width: W, height: H)); if t >= 5 && t <= 8 { silhouette(ctx, x: -250 + (t - 5) / 3 * 2420) } }
truth.append(["file": "S07_face_walkthrough.mp4", "expect": "face, someone walks through 5-8 s", "note": "as S06 plus a dark figure crossing 5-8 s"])

write("S08_handheld_wobble.mp4", seconds: 10) { ctx, t, _ in view(ctx, cx: 1920 + 14 * sin(2 * .pi * 1.3 * t) + 9 * sin(2 * .pi * 0.7 * t + 1), cy: 1080 + 11 * sin(2 * .pi * 1.1 * t + 2), rot: 0.4 * sin(2 * .pi * 0.9 * t)) }
truth.append(["file": "S08_handheld_wobble.mp4", "expect": "handheld", "note": "smooth low-frequency sway +-14 px and +-0.4 deg (phone wobble)"])

write("S09_push_in.mp4", seconds: 10) { ctx, t, _ in view(ctx, zoom: 1 + 0.6 * ss((t - 1) / 8)) }
truth.append(["file": "S09_push_in.mp4", "expect": "push-in 1-9 s", "note": "zoom 1x to 1.6x, smoothstep 1-9 s"])

write("S10_tilt_up.mp4", seconds: 10) { ctx, t, _ in view(ctx, cy: 1300 - 450 * ss((t - 1) / 8)) }
truth.append(["file": "S10_tilt_up.mp4", "expect": "tilt / crane 1-9 s", "note": "view moves up 450 px (2x scene) smoothstep 1-9 s"])

let json = try! JSONSerialization.data(withJSONObject: ["fps": FPS, "size": "1920x1080", "clips": truth], options: [.prettyPrinted, .sortedKeys])
try! json.write(to: outDir.appendingPathComponent("truth.json"))
print("done")
