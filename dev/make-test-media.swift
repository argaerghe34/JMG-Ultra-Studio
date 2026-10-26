#!/usr/bin/env swift
// make-test-media.swift
//
// Deterministic synthetic test media for the Cutroom Premiere Pro panel (dev/test only, NOT shipped).
//
// Build & run (compiled is ~10x faster than `swift make-test-media.swift`):
//   swiftc -O "dev/make-test-media.swift" -o /tmp/make-test-media
//   /tmp/make-test-media "<abs path>/dev/test-media"          # generate + verify
//   /tmp/make-test-media "<abs path>/dev/test-media" --verify-only
//   /tmp/make-test-media "<abs path>/dev/test-media" --no-verify
// If no output dir is given, ./test-media next to this source file is used.
//
// Only Apple system frameworks are used (Foundation, AVFoundation, CoreGraphics, CoreText,
// CoreVideo, CoreMedia). All synthesis is driven by a seeded SplitMix64 RNG, so the rendered
// pixels and audio samples are identical on every run. WAV/JSON/README outputs are byte-identical;
// .mp4 bytes are not (container creation timestamps, Apple's H.264/AAC encoders).

import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import CoreVideo
import CoreMedia

setvbuf(stdout, nil, _IOLBF, 0)

// MARK: - Configuration

let SR = 48_000
let SRd = 48_000.0
let FPS = 25
let OW = 1920, OH = 1080          // output video size
let SW = 3840, SH = 2160          // master scene size (2x)
let VIDEO_BITRATE = 6_000_000
let AUDIO_BITRATE = 192_000
let SAMPLES_PER_FRAME = SR / FPS  // 1920

// Default camera view for "normal" footage: a 1:1 1920x1080 crop of the 2x scene.
let DEF_X = 1280, DEF_Y = 700

let cliArgs = Array(CommandLine.arguments.dropFirst())
let verifyOnly = cliArgs.contains("--verify-only")
let skipVerify = cliArgs.contains("--no-verify")
let outRoot: URL = {
    if let p = cliArgs.first(where: { !$0.hasPrefix("--") }) { return URL(fileURLWithPath: p).standardizedFileURL }
    return URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("test-media")
}()
let concertDir = outRoot.appendingPathComponent("concert")
let interviewDir = outRoot.appendingPathComponent("interview")
let audioDir = outRoot.appendingPathComponent("audio")

let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let bgraInfo: UInt32 = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
typealias Px = UnsafeMutablePointer<UInt8>

// MARK: - Small utilities

@inline(__always) func clamp<T: Comparable>(_ x: T, _ lo: T, _ hi: T) -> T { min(max(x, lo), hi) }
func smoothstep(_ x: Double) -> Double { let t = clamp(x, 0.0, 1.0); return t * t * (3 - 2 * t) }
func dbToAmp(_ db: Double) -> Double { pow(10, db / 20) }
func ampToDb(_ a: Double) -> Double { 20 * log10(max(a, 1e-12)) }
func midiFreq(_ m: Double) -> Double { 440 * pow(2, (m - 69) / 12) }
func f2(_ v: Double, _ d: Int = 2) -> String { String(format: "%.\(d)f", v) }
func ensureDir(_ u: URL) { try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true) }
func col(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> CGColor { CGColor(srgbRed: r, green: g, blue: b, alpha: a) }
func hsv(_ h: Double, _ s: Double, _ v: Double) -> (Double, Double, Double) {
    let hh = (h - floor(h)) * 6, i = Int(hh) % 6, f = hh - floor(hh)
    let p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
    switch i {
    case 0: return (v, t, p)
    case 1: return (q, v, p)
    case 2: return (p, v, t)
    case 3: return (p, q, v)
    case 4: return (t, p, v)
    default: return (v, p, q)
    }
}
struct GenError: Error, CustomStringConvertible { let description: String; init(_ s: String) { description = s } }

// SplitMix64 – tiny, fast, deterministic.
struct RNG {
    private var s: UInt64
    init(_ seed: UInt64) { s = seed }
    mutating func next() -> UInt64 {
        s &+= 0x9E37_79B9_7F4A_7C15
        var z = s
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
    mutating func uniform() -> Double { Double(next() >> 11) * 0x1.0p-53 }
    mutating func range(_ a: Double, _ b: Double) -> Double { a + (b - a) * uniform() }
    mutating func int(_ a: Int, _ b: Int) -> Int { a + Int(next() % UInt64(b - a + 1)) }  // inclusive
    mutating func bipolar() -> Double { uniform() * 2 - 1 }
    mutating func chance(_ p: Double) -> Bool { uniform() < p }
}

// MARK: - Minimal ordered JSON writer (controlled number formatting)

indirect enum J {
    case n(Double, Int)   // number, max decimals
    case i(Int)
    case s(String)
    case b(Bool)
    case a([J])
    case o([(String, J)])
    var isScalar: Bool { switch self { case .a, .o: return false; default: return true } }
}
func numStr(_ v: Double, _ d: Int) -> String {
    var s = String(format: "%.\(d)f", v)
    if s.contains(".") {
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s += "0" }
    }
    if s == "-0.0" { s = "0.0" }
    return s
}
func jsonEsc(_ s: String) -> String {
    var r = "\""
    for c in s.unicodeScalars {
        switch c {
        case "\"": r += "\\\""
        case "\\": r += "\\\\"
        case "\n": r += "\\n"
        default: r.unicodeScalars.append(c)
        }
    }
    return r + "\""
}
func jsonString(_ j: J, _ ind: Int = 0) -> String {
    let pad = String(repeating: "  ", count: ind), pad1 = String(repeating: "  ", count: ind + 1)
    switch j {
    case .n(let v, let d): return numStr(v, d)
    case .i(let v): return String(v)
    case .s(let v): return jsonEsc(v)
    case .b(let v): return v ? "true" : "false"
    case .a(let arr):
        if arr.isEmpty { return "[]" }
        if arr.allSatisfy({ $0.isScalar }) {
            var lines: [String] = []
            var k = 0
            while k < arr.count {
                lines.append(arr[k..<min(k + 10, arr.count)].map { jsonString($0) }.joined(separator: ", "))
                k += 10
            }
            if lines.count == 1 { return "[" + lines[0] + "]" }
            return "[\n" + lines.map { pad1 + $0 }.joined(separator: ",\n") + "\n" + pad + "]"
        }
        return "[\n" + arr.map { pad1 + jsonString($0, ind + 1) }.joined(separator: ",\n") + "\n" + pad + "]"
    case .o(let kv):
        if kv.isEmpty { return "{}" }
        if ind > 0 && kv.allSatisfy({ $0.1.isScalar }) {
            let s = "{ " + kv.map { jsonEsc($0.0) + ": " + jsonString($0.1) }.joined(separator: ", ") + " }"
            if s.count <= 150 { return s }
        }
        return "{\n" + kv.map { pad1 + jsonEsc($0.0) + ": " + jsonString($0.1, ind + 1) }.joined(separator: ",\n") + "\n" + pad + "}"
    }
}
func writeJSON(_ j: J, _ url: URL) throws {
    try (jsonString(j) + "\n").write(to: url, atomically: true, encoding: .utf8)
}
func span(_ a: Double, _ b: Double, _ d: Int = 3) -> J { .o([("start", .n(a, d)), ("end", .n(b, d)), ("duration", .n(b - a, d))]) }

// MARK: - Audio primitives

enum FilterType { case lowpass, highpass, bandpass }

// RBJ biquad, transposed direct form II.
struct Biquad {
    var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    var z1 = 0.0, z2 = 0.0
    init(_ type: FilterType, _ f: Double, _ q: Double) {
        let w = 2 * Double.pi * f / SRd
        let cw = cos(w), sw = sin(w), alpha = sw / (2 * q)
        let a0 = 1 + alpha
        var nb0 = 0.0, nb1 = 0.0, nb2 = 0.0
        switch type {
        case .lowpass: nb0 = (1 - cw) / 2; nb1 = 1 - cw; nb2 = (1 - cw) / 2
        case .highpass: nb0 = (1 + cw) / 2; nb1 = -(1 + cw); nb2 = (1 + cw) / 2
        case .bandpass: nb0 = alpha; nb1 = 0; nb2 = -alpha
        }
        b0 = nb0 / a0; b1 = nb1 / a0; b2 = nb2 / a0
        a1 = (-2 * cw) / a0; a2 = (1 - alpha) / a0
    }
    @inline(__always) mutating func process(_ x: Double) -> Double {
        let y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }
}

struct Stereo {
    var L: [Float]
    var R: [Float]
    init(count: Int) { L = [Float](repeating: 0, count: count); R = [Float](repeating: 0, count: count) }
    var count: Int { L.count }
    mutating func add(_ o: Stereo, at off: Int, gain: Float = 1) {
        let lo = max(0, -off), hi = min(o.count, count - off)
        if hi <= lo { return }
        for i in lo..<hi { L[off + i] += o.L[i] * gain; R[off + i] += o.R[i] * gain }
    }
    func rms(_ a: Int = 0, _ b: Int = -1) -> Double {
        let hi = b < 0 ? count : min(b, count), lo = max(0, a)
        if hi <= lo { return 0 }
        var s = 0.0
        for i in lo..<hi { s += Double(L[i]) * Double(L[i]) + Double(R[i]) * Double(R[i]) }
        return sqrt(s / Double(2 * (hi - lo)))
    }
    func peak() -> Double {
        var p: Float = 0
        for i in 0..<count { p = max(p, abs(L[i]), abs(R[i])) }
        return Double(p)
    }
    mutating func scale(_ g: Double) {
        let gf = Float(g)
        for i in 0..<count { L[i] *= gf; R[i] *= gf }
    }
    mutating func fade(inSamples: Int, outSamples: Int) {
        if inSamples > 0 { for i in 0..<min(inSamples, count) { let g = Float(i) / Float(inSamples); L[i] *= g; R[i] *= g } }
        if outSamples > 0 {
            for k in 0..<min(outSamples, count) {
                let i = count - 1 - k
                let g = Float(k) / Float(outSamples)
                L[i] *= g; R[i] *= g
            }
        }
    }
    func slice(_ a: Int, _ b: Int) -> Stereo {
        var s = Stereo(count: b - a)
        for i in 0..<(b - a) where a + i < count { s.L[i] = L[a + i]; s.R[i] = R[a + i] }
        return s
    }
}
func normalizeRMS(_ st: inout Stereo, _ db: Double) { let r = st.rms(); if r > 0 { st.scale(dbToAmp(db) / r) } }
func normalizePeak(_ st: inout Stereo, _ db: Double) { let p = st.peak(); if p > 0 { st.scale(dbToAmp(db) / p) } }
func rmsOf(_ a: [Float], _ lo: Int = 0, _ hi: Int = -1) -> Double {
    let h = hi < 0 ? a.count : min(hi, a.count)
    if h <= lo { return 0 }
    var s = 0.0
    for i in lo..<h { s += Double(a[i]) * Double(a[i]) }
    return sqrt(s / Double(h - lo))
}
func softClip(_ st: inout Stereo) {
    @inline(__always) func sc(_ x: Float) -> Float {
        let a = Double(abs(x))
        if a <= 0.9 { return x }
        let y = Float(0.9 + 0.09 * tanh((a - 0.9) / 0.09))
        return x < 0 ? -y : y
    }
    for i in 0..<st.count { st.L[i] = sc(st.L[i]); st.R[i] = sc(st.R[i]) }
}

// Paul Kellet's pink-noise filter.
func pinkNoise(_ n: Int, _ rng: inout RNG) -> [Float] {
    var out = [Float](repeating: 0, count: n)
    var b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0
    for i in 0..<n {
        let w = rng.bipolar()
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        let p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
        b6 = w * 0.115926
        out[i] = Float(p * 0.11)
    }
    return out
}

// MARK: - Speech-like synthesis

/// One phrase of "speech": band-limited (300-3000 Hz) noise + glottal-like sawtooth, amplitude-modulated
/// by syllables of 120-300 ms (~4-5 Hz) with short intra-phrase gaps. Envelope is exactly zero outside
/// [start, end] and the first/last syllable touch the boundaries.
func addSpeechPhrase(_ out: inout [Float], start: Double, end: Double, f0Base: Double, rng: inout RNG, gain: Double = 1) {
    let s = max(0, Int((start * SRd).rounded()))
    let e = min(out.count, Int((end * SRd).rounded()))
    guard e - s > Int(0.05 * SRd) else { return }
    let n = e - s
    let dur = Double(n) / SRd
    var syl: [(a: Int, b: Int, amp: Double, f0: Double)] = []
    var t = 0.0
    while t < dur - 1e-9 {
        var L = rng.range(0.12, 0.30)
        if dur - (t + L) < 0.25 { L = dur - t }
        let prog = t / dur
        let f0 = f0Base * (1 + 0.12 * rng.bipolar()) * (1 - 0.15 * prog)
        let amp = rng.range(0.55, 1.0)
        syl.append((Int((t * SRd).rounded()), min(n, Int(((t + L) * SRd).rounded())), amp, f0))
        t += L
        if t >= dur - 1e-9 { break }
        t += rng.chance(0.7) ? rng.range(0.01, 0.05) : rng.range(0.06, 0.12)
    }
    var env = [Float](repeating: 0, count: n)
    var f0s = [Float](repeating: Float(f0Base), count: n)
    for sy in syl {
        let len = sy.b - sy.a
        if len < 2 { continue }
        for i in sy.a..<sy.b {
            let x = Double(i - sy.a) / Double(len)
            env[i] = Float(sy.amp * pow(sin(Double.pi * x), 0.6))
            f0s[i] = Float(sy.f0)
        }
    }
    var hp1 = Biquad(.highpass, 300, 0.707), hp2 = Biquad(.highpass, 300, 0.707)
    var lp1 = Biquad(.lowpass, 3000, 0.707), lp2 = Biquad(.lowpass, 3000, 0.707)
    var ph = 0.0
    for i in 0..<n {
        ph += Double(f0s[i]) / SRd
        if ph >= 1 { ph -= 1 }
        let exc = 0.6 * rng.bipolar() + 0.5 * (2 * ph - 1)
        var y = hp1.process(exc)
        y = hp2.process(y); y = lp1.process(y); y = lp2.process(y)
        out[s + i] += Float(y * gain) * env[i]
    }
}

/// Fill [a, b] (centiseconds) with phrases of length [minL, maxL] separated by pauses [minP, maxP].
/// The first phrase starts exactly at a and the last ends exactly at b.
func fillPhrasesCS(_ a: Int, _ b: Int, minL: Int, maxL: Int, minP: Int, maxP: Int, rng: inout RNG) -> [(Int, Int)] {
    var out: [(Int, Int)] = []
    var pos = a
    while true {
        let rem = b - pos
        if rem <= maxL { out.append((pos, b)); break }
        let hi = min(maxL, rem - maxP - minL)
        let L = rng.int(minL, hi)
        let P = rng.int(minP, maxP)
        out.append((pos, pos + L))
        pos += L + P
    }
    return out
}
func speechRMS(_ a: [Float], _ phrasesCS: [(Int, Int)], offsetCS: Int = 0) -> Double {
    var s = 0.0, n = 0
    for (p, q) in phrasesCS {
        let lo = (p - offsetCS) * SR / 100, hi = min(a.count, (q - offsetCS) * SR / 100)
        for i in lo..<hi { s += Double(a[i]) * Double(a[i]) }
        n += hi - lo
    }
    return sqrt(s / Double(max(1, n)))
}

/// Soft crowd ambience: babble of `voices` distant talkers + pink-noise bed, normalized to rmsDB.
func synthCrowd(duration: Double, seed: UInt64, voices: Int, rmsDB: Double) -> Stereo {
    var rng = RNG(seed)
    let n = Int((duration * SRd).rounded())
    var st = Stereo(count: n)
    var mono = [Float](repeating: 0, count: n)
    for _ in 0..<voices {
        for i in 0..<n { mono[i] = 0 }
        let f0 = rng.chance(0.5) ? rng.range(95, 140) : rng.range(170, 240)
        var t = rng.range(-1.0, 0.8)
        while t < duration {
            let L = rng.range(0.8, 3.0)
            let s = max(0, t), e = min(duration, t + L)
            if e - s > 0.25 { addSpeechPhrase(&mono, start: s, end: e, f0Base: f0, rng: &rng) }
            t += L + rng.range(0.2, 1.5)
        }
        var lp = Biquad(.lowpass, 1800, 0.707)
        let lvl = rng.range(0.4, 1.0), pan = rng.range(0.15, 0.85) * Double.pi / 2
        let gl = Float(cos(pan) * lvl), gr = Float(sin(pan) * lvl)
        for i in 0..<n { let y = Float(lp.process(Double(mono[i]))); st.L[i] += y * gl; st.R[i] += y * gr }
    }
    let vr = st.rms()
    var pl = pinkNoise(n, &rng), pr = pinkNoise(n, &rng)
    var l1 = Biquad(.lowpass, 2500, 0.707), l2 = Biquad(.lowpass, 2500, 0.707)
    var h1 = Biquad(.highpass, 120, 0.707), h2 = Biquad(.highpass, 120, 0.707)
    for i in 0..<n {
        pl[i] = Float(l1.process(h1.process(Double(pl[i]))))
        pr[i] = Float(l2.process(h2.process(Double(pr[i]))))
    }
    let p0 = sqrt((pow(rmsOf(pl), 2) + pow(rmsOf(pr), 2)) / 2)
    let bedGain = Float((vr > 0 ? 0.6 * vr : 1.0) / max(p0, 1e-9))
    for i in 0..<n { st.L[i] += pl[i] * bedGain; st.R[i] += pr[i] * bedGain }
    normalizeRMS(&st, rmsDB)
    return st
}

// MARK: - Applause / cheers

func synthApplause(duration: Double, seed: UInt64, attack: Double, sustainFrac: Double, tailLevel: Double,
                   endFade: Double, cheers: Bool, rmsDB: Double) -> Stereo {
    var rng = RNG(seed)
    let n = Int((duration * SRd).rounded())
    var st = Stereo(count: n)
    let wob = rng.range(0, 2 * Double.pi)
    func intensity(_ t: Double) -> Double {
        var v = 0.15 + 0.85 * smoothstep(t / attack)
        v *= 1 + 0.08 * sin(2 * Double.pi * t / 3.1 + wob)
        let ds = duration * sustainFrac
        if t > ds { v *= 1 - (1 - tailLevel) * smoothstep((t - ds) / (duration - ds)) }
        if endFade > 0 && t > duration - endFade { v *= max(0, (duration - t) / endFade) }
        return v
    }
    // Individual clappers: band-passed noise bursts, ~3-5 claps/s each, 90 clappers.
    let clapLen = Int(0.03 * SRd)
    for _ in 0..<90 {
        let rate = rng.range(2.6, 4.8)
        let fc = rng.range(800, 2600), q = rng.range(0.9, 1.8), tau = rng.range(0.003, 0.007)
        let g = rng.range(0.5, 1.0)
        let pan = rng.range(0.3, 0.7) * Double.pi / 2
        let gl = cos(pan), gr = sin(pan)
        var t = rng.range(0, 1 / rate)
        while t < duration {
            let I = intensity(t)
            if rng.uniform() < min(1, I + 0.15) {
                var bp = Biquad(.bandpass, fc * rng.range(0.85, 1.15), q)
                let s0 = Int((t * SRd).rounded())
                let a = g * I * rng.range(0.7, 1.0)
                for i in 0..<clapLen {
                    let j = s0 + i
                    if j >= n { break }
                    let y = bp.process(rng.bipolar()) * exp(-(Double(i) / SRd) / tau) * a
                    st.L[j] += Float(y * gl); st.R[j] += Float(y * gr)
                }
            }
            t += (1 / rate) * (1 + 0.15 * rng.bipolar())
        }
    }
    let clapRMS = st.rms()
    // Broadband bed that follows the intensity envelope.
    var bl = pinkNoise(n, &rng), br = pinkNoise(n, &rng)
    var fl1 = Biquad(.highpass, 400, 0.707), fl2 = Biquad(.lowpass, 6000, 0.707)
    var fr1 = Biquad(.highpass, 400, 0.707), fr2 = Biquad(.lowpass, 6000, 0.707)
    for i in 0..<n {
        bl[i] = Float(fl2.process(fl1.process(Double(bl[i]))))
        br[i] = Float(fr2.process(fr1.process(Double(br[i]))))
    }
    let bedR = sqrt((pow(rmsOf(bl), 2) + pow(rmsOf(br), 2)) / 2)
    let bedG = 0.35 * clapRMS / max(bedR, 1e-9)
    var I = intensity(0)
    for i in 0..<n {
        if i % 64 == 0 { I = intensity(Double(i) / SRd) }
        st.L[i] += Float(Double(bl[i]) * bedG * I); st.R[i] += Float(Double(br[i]) * bedG * I)
    }
    if cheers {
        var ch = Stereo(count: n)
        for _ in 0..<18 {   // "woo" voices
            let ts = rng.range(0.3, max(0.4, duration - 4)), d = rng.range(0.7, 1.8)
            let f0 = rng.chance(0.5) ? rng.range(200, 300) : rng.range(320, 480)
            let vib = rng.range(4.5, 6.5), amp = rng.range(0.5, 1.0)
            let pan = rng.range(0.25, 0.75) * Double.pi / 2
            var fm = Biquad(.bandpass, rng.range(600, 1100), 0.8)
            var ph = 0.0
            let s0 = Int(ts * SRd), len = Int(d * SRd)
            for i in 0..<len {
                let j = s0 + i
                if j >= n { break }
                let tt = Double(i) / SRd, x = tt / d
                let f = f0 * (1 + 0.35 * pow(sin(Double.pi * x), 1.5)) * (1 + 0.025 * sin(2 * Double.pi * vib * tt))
                ph += f / SRd
                if ph > 1 { ph -= 1 }
                var v = 0.0
                for k in 1...6 { v += sin(2 * Double.pi * Double(k) * ph) / Double(k) }
                let e = min(1, tt / 0.08) * min(1, (d - tt) / 0.35) * amp
                let y = (0.5 * v + fm.process(v)) * e
                ch.L[j] += Float(y * cos(pan)); ch.R[j] += Float(y * sin(pan))
            }
        }
        for _ in 0..<6 {    // whistles
            let ts = rng.range(0.5, max(0.6, duration - 3)), d = rng.range(0.4, 1.0)
            let f0 = rng.range(1800, 3000), amp = rng.range(0.4, 0.8)
            var ph = 0.0
            let s0 = Int(ts * SRd), len = Int(d * SRd)
            for i in 0..<len {
                let j = s0 + i
                if j >= n { break }
                let tt = Double(i) / SRd, x = tt / d
                let f = f0 * (1 + 0.2 * sin(Double.pi * x)) * (1 + 0.01 * sin(2 * Double.pi * 7 * tt))
                ph += f / SRd
                if ph > 1 { ph -= 1 }
                let e = min(1, tt / 0.03) * min(1, (d - tt) / 0.08) * amp
                let y = sin(2 * Double.pi * ph) * e
                ch.L[j] += Float(y); ch.R[j] += Float(y)
            }
        }
        let cr = ch.rms()
        if cr > 0 {
            let g = Float(0.6 * clapRMS / cr)
            for i in 0..<n {
                let tI = Float(min(1, intensity(Double(i) / SRd) + 0.2))
                st.L[i] += ch.L[i] * g * tI; st.R[i] += ch.R[i] * g * tI
            }
        }
    }
    normalizeRMS(&st, rmsDB)
    return st
}

// MARK: - Music synthesis

struct SongSpec {
    var bpm: Double
    var duration: Double
    var tonic: Int       // pitch class 0=C
    var minor: Bool
    var melody: Bool
    var bass: Bool
    var seed: UInt64
    var firstBeat: Double
    var fadeIn: Double
    var fadeOut: Double
}
let NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
func keyName(_ tonic: Int, _ minor: Bool) -> String { NOTE_NAMES[tonic] + (minor ? " minor" : " major") }
func progression(_ sp: SongSpec) -> [(pc: Int, minor: Bool)] {
    // minor: i - VI - III - VII ; major: I - V - vi - IV  (one chord per bar)
    let degs: [(Int, Bool)] = sp.minor ? [(0, true), (8, false), (3, false), (10, false)]
                                       : [(0, false), (7, false), (9, true), (5, false)]
    return degs.map { ((sp.tonic + $0.0) % 12, $0.1) }
}
func chordName(_ c: (pc: Int, minor: Bool)) -> String { NOTE_NAMES[c.pc] + (c.minor ? "m" : "") }

/// Kick: sine sweep 120 -> 50 Hz, exponential decay (tau 40 ms, -26 dB at 120 ms), 180 ms long.
func addKick(_ st: inout Stereo, at s: Int, gain: Double) {
    let len = Int(0.18 * SRd)
    var ph = 0.0
    for i in 0..<len {
        let j = s + i
        if j >= st.count { break }
        if j < 0 { continue }
        let t = Double(i) / SRd
        let f = 50.0 + 70.0 * exp(-t / 0.03)
        ph += 2.0 * Double.pi * f / SRd
        var e = exp(-t / 0.04)
        if t > 0.15 { e *= (0.18 - t) / 0.03 }
        let y = Float(sin(ph) * e * gain)
        st.L[j] += y; st.R[j] += y
    }
}
func addSnare(_ st: inout Stereo, at s: Int, gain: Double, rng: inout RNG) {
    let len = Int(0.2 * SRd)
    var hp = Biquad(.highpass, 1200, 0.7), lp = Biquad(.lowpass, 9000, 0.7)
    var ph = 0.0
    for i in 0..<len {
        let j = s + i
        if j >= st.count { break }
        let t = Double(i) / SRd
        let nz = lp.process(hp.process(rng.bipolar())) * exp(-t / 0.055)
        ph += 2.0 * Double.pi * 185.0 / SRd
        let tone = 0.55 * sin(ph) * exp(-t / 0.03)
        var y = (nz + tone) * gain
        if t > 0.17 { y *= (0.2 - t) / 0.03 }
        if j >= 0 { st.L[j] += Float(y); st.R[j] += Float(y) }
    }
}
func addHat(_ st: inout Stereo, at s: Int, gain: Double, rng: inout RNG) {
    let len = Int(0.06 * SRd)
    var h1 = Biquad(.highpass, 7000, 0.7), h2 = Biquad(.highpass, 7000, 0.7)
    for i in 0..<len {
        let j = s + i
        if j >= st.count { break }
        let t = Double(i) / SRd
        var y = h2.process(h1.process(rng.bipolar())) * exp(-t / 0.012) * gain
        if t > 0.05 { y *= (0.06 - t) / 0.01 }
        if j >= 0 { st.L[j] += Float(y * 0.85); st.R[j] += Float(y) }
    }
}
func addPadChord(_ st: inout Stereo, notes: [Int], t0: Double, t1: Double, xf: Double) {
    let a = max(0, Int(((t0 - xf / 2) * SRd).rounded()))
    let b = min(st.count, Int(((t1 + xf / 2) * SRd).rounded()))
    if b <= a { return }
    let fL = notes.map { midiFreq(Double($0)) * 0.9985 }, fR = notes.map { midiFreq(Double($0)) * 1.0015 }
    let rampS = xf * SRd, startS = (t0 - xf / 2) * SRd, endS = (t1 + xf / 2) * SRd
    for i in a..<b {
        let t = Double(i) / SRd
        let e = min(clamp((Double(i) - startS) / rampS, 0.0, 1.0), clamp((endS - Double(i)) / rampS, 0.0, 1.0))
        var l = 0.0, r = 0.0
        for f in fL { let p = 2 * Double.pi * f * t; l += sin(p) + 0.25 * sin(2 * p) }
        for f in fR { let p = 2 * Double.pi * f * t; r += sin(p) + 0.25 * sin(2 * p) }
        st.L[i] += Float(l * e); st.R[i] += Float(r * e)
    }
}
func addTone(_ st: inout Stereo, start: Double, dur: Double, freq: Double, harmonics: [Double], attack: Double,
             decayTau: Double, sustain: Double, release: Double, vibrato: Double, panL: Double, panR: Double) {
    let s0 = Int((start * SRd).rounded()), n = Int(dur * SRd)
    var ph = 0.0
    for i in 0..<n {
        let j = s0 + i
        if j >= st.count { break }
        let t = Double(i) / SRd
        var e = t < attack ? t / attack : sustain + (1 - sustain) * exp(-(t - attack) / decayTau)
        let tr = dur - t
        if tr < release { e *= tr / release }
        let vib = vibrato > 0 ? 1 + vibrato * sin(2 * Double.pi * 5.5 * t) * clamp((t - 0.15) / 0.1, 0.0, 1.0) : 1
        ph += freq * vib / SRd
        if ph > 1 { ph -= 1 }
        var v = 0.0
        for (k, h) in harmonics.enumerated() { v += h * sin(2 * Double.pi * Double(k + 1) * ph) }
        let y = v * e
        if j >= 0 { st.L[j] += Float(y * panL); st.R[j] += Float(y * panR) }
    }
}
struct MelNote { var beat: Double; var len: Double; var deg: Int }
func melodyPhrase(_ rng: inout RNG) -> [MelNote] {   // 4 bars = 16 beats
    var notes: [MelNote] = []
    var deg = rng.int(2, 6)
    for q in 0..<16 {
        let r = rng.uniform()
        if r < 0.1 && q % 4 != 0 { continue }
        if r < 0.45 {
            for h in 0..<2 {
                deg = clamp(deg + rng.int(-2, 2), 0, 11)
                notes.append(MelNote(beat: Double(q) + 0.5 * Double(h), len: 0.5, deg: deg))
            }
        } else {
            deg = clamp(deg + rng.int(-2, 2), 0, 11)
            notes.append(MelNote(beat: Double(q), len: 1, deg: deg))
        }
    }
    if !notes.isEmpty { notes[notes.count - 1].deg = [0, 4, 7][rng.int(0, 2)] }
    return notes
}

/// Returns the song and its beat times (relative to song start). Beat k: kick; k%4==1,3: snare;
/// hats on every 8th; pad chord per bar; optional bass + melody (melody from bar 3 on, 4-bar phrases AABA).
func synthSong(_ sp: SongSpec) -> (Stereo, [Double]) {
    var rng = RNG(sp.seed)
    let n = Int((sp.duration * SRd).rounded())
    var drums = Stereo(count: n), pad = Stereo(count: n), mel = Stereo(count: n), bass = Stereo(count: n)
    let beat = 60 / sp.bpm
    var beats: [Double] = []
    var k = 0
    while true {
        let t = sp.firstBeat + Double(k) * beat
        if t >= sp.duration - 1e-9 { break }
        beats.append(t); k += 1
    }
    for (k, t) in beats.enumerated() {
        let s = Int((t * SRd).rounded())
        addKick(&drums, at: s, gain: 0.95)
        if k % 4 == 1 || k % 4 == 3 { addSnare(&drums, at: s, gain: 0.5, rng: &rng) }
        addHat(&drums, at: s, gain: 0.16, rng: &rng)
        let off = Int(((t + beat / 2) * SRd).rounded())
        if off < n { addHat(&drums, at: off, gain: 0.11, rng: &rng) }
    }
    let prog = progression(sp)
    let bar = 4 * beat
    let nBars = Int(ceil((sp.duration - sp.firstBeat) / bar))
    for b in 0..<nBars {
        let c = prog[b % 4]
        let root = 48 + c.pc
        let notes = [root + 12, root + 12 + (c.minor ? 3 : 4), root + 19]
        let t0 = sp.firstBeat + Double(b) * bar
        addPadChord(&pad, notes: notes, t0: t0, t1: t0 + bar, xf: 0.06)
        if sp.bass {
            for q in 0..<4 {
                let tq = t0 + Double(q) * beat
                if tq >= sp.duration { break }
                let m = root - 12 + (q == 3 ? 7 : 0)
                addTone(&bass, start: tq, dur: beat * 0.85, freq: midiFreq(Double(m)), harmonics: [1, 0.45, 0.2],
                        attack: 0.006, decayTau: 0.25, sustain: 0.35, release: 0.03, vibrato: 0, panL: 1, panR: 1)
            }
        }
    }
    if sp.melody {
        let A = melodyPhrase(&rng), B = melodyPhrase(&rng)
        let scale = sp.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]
        let base = 60 + sp.tonic
        var p = 0
        while true {
            let ps = sp.firstBeat + Double(2 + 4 * p) * bar
            if ps + 4 * bar > sp.duration - max(sp.fadeOut, 0.5) + 1e-9 { break }
            let pat = [A, A, B, A][p % 4]
            for nt in pat {
                let m = base + scale[nt.deg % 7] + 12 * (nt.deg / 7)
                addTone(&mel, start: ps + nt.beat * beat, dur: nt.len * beat * 0.88, freq: midiFreq(Double(m)),
                        harmonics: [1, 0.35, 0.15, 0.06], attack: 0.01, decayTau: 0.18, sustain: 0.6, release: 0.04,
                        vibrato: 0.004, panL: 0.9, panR: 1.0)
            }
            p += 1
        }
    }
    var out = Stereo(count: n)
    for i in 0..<n {
        out.L[i] = drums.L[i] + 0.11 * pad.L[i] + 0.26 * mel.L[i] + 0.33 * bass.L[i]
        out.R[i] = drums.R[i] + 0.11 * pad.R[i] + 0.26 * mel.R[i] + 0.33 * bass.R[i]
    }
    out.fade(inSamples: Int(sp.fadeIn * SRd), outSamples: Int(sp.fadeOut * SRd))
    return (out, beats)
}

// MARK: - WAV writer (PCM 16-bit stereo 48 kHz)

func writeWAV(_ url: URL, _ st: Stereo) throws {
    let n = st.count
    var d = Data(capacity: 44 + n * 4)
    func u32(_ v: UInt32) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
    func tag(_ s: String) { d.append(contentsOf: Array(s.utf8)) }
    tag("RIFF"); u32(UInt32(36 + n * 4)); tag("WAVE")
    tag("fmt "); u32(16); u16(1); u16(2); u32(UInt32(SR)); u32(UInt32(SR * 4)); u16(4); u16(16)
    tag("data"); u32(UInt32(n * 4))
    var pcm = [Int16](repeating: 0, count: n * 2)
    for i in 0..<n {
        pcm[2 * i] = Int16(clamp((Double(st.L[i]) * 32767).rounded(), -32768, 32767))
        pcm[2 * i + 1] = Int16(clamp((Double(st.R[i]) * 32767).rounded(), -32768, 32767))
    }
    pcm.withUnsafeBytes { d.append(contentsOf: $0) }
    try d.write(to: url)
}

// MARK: - Audio programs

struct Segment { var type: String; var label: String; var start: Double; var end: Double; var extra: [(String, J)] = [] }

func musicTruth(file: String, spec: SongSpec, beats: [Double]) -> J {
    let prog = progression(spec)
    return .o([
        ("file", .s(file)),
        ("duration", .n(spec.duration, 3)),
        ("sample_rate", .i(SR)),
        ("bpm", .n(spec.bpm, 3)),
        ("beat_interval", .n(60 / spec.bpm, 9)),
        ("first_beat", .n(spec.firstBeat, 6)),
        ("time_signature", .s("4/4")),
        ("beat_count", .i(beats.count)),
        ("key", .s(keyName(spec.tonic, spec.minor))),
        ("chords_per_bar", .a(prog.map { .s(chordName($0)) })),
        ("instrumentation", .s("kick (sine sweep 120->50 Hz, tau 40 ms) on every beat; snare (noise burst + 185 Hz) on beats 2 and 4; closed hi-hat on every 8th; sustained 3-note chord pad, one chord per bar; no melody/bass")),
        ("notes", .s("beats[k] = first_beat + k*60/bpm (exact; onset sample = round(t*48000)). downbeats = beats 1 of each 4/4 bar. Digital silence until first_beat - 0.03 s, where the pad starts a 60 ms fade-in; the first kick is exactly at first_beat.")),
        ("beats", .a(beats.map { .n($0, 6) })),
        ("downbeats", .a(stride(from: 0, to: beats.count, by: 4).map { .n(beats[$0], 6) })),
    ])
}

func buildConcert() -> (Stereo, [Segment], [(Double, Double)]) {
    let total = 291.0
    print("   crowd bed ...")
    var mix = synthCrowd(duration: total, seed: 7001, voices: 6, rmsDB: -42)
    var segs: [Segment] = []
    var talkPhrases: [(Double, Double)] = []
    func put(_ st: Stereo, _ start: Double) { mix.add(st, at: Int((start * SRd).rounded())) }
    func applause(_ label: String, _ start: Double, _ dur: Double, seed: UInt64, attack: Double, tail: Double, endFade: Double, cheers: Bool) {
        put(synthApplause(duration: dur, seed: seed, attack: attack, sustainFrac: 0.55, tailLevel: tail, endFade: endFade, cheers: cheers, rmsDB: -18), start)
        segs.append(Segment(type: "applause", label: label, start: start, end: start + dur,
                            extra: cheers ? [("cheers", .b(true))] : []))
    }
    func song(_ label: String, _ start: Double, _ dur: Double, bpm: Double, tonic: Int, minor: Bool, seed: UInt64,
              fadeIn: Double, fadeOut: Double, segue: Bool) {
        let sp = SongSpec(bpm: bpm, duration: dur, tonic: tonic, minor: minor, melody: true, bass: true, seed: seed,
                          firstBeat: 0, fadeIn: fadeIn, fadeOut: fadeOut)
        let r = synthSong(sp)
        var st = r.0
        let beats = r.1
        normalizeRMS(&st, -14)
        put(st, start)
        var ex: [(String, J)] = [
            ("bpm", .n(bpm, 3)), ("key", .s(keyName(tonic, minor))),
            ("chords_per_bar", .a(progression(sp).map { .s(chordName($0)) })),
            ("first_beat", .n(start + beats[0], 6)), ("last_beat", .n(start + beats[beats.count - 1], 6)),
            ("beat_count", .i(beats.count)), ("beat_interval", .n(60 / bpm, 9)),
            ("fade_out", .n(fadeOut, 3)),
        ]
        if segue { ex.append(("segue_from_previous_song", .b(true))) }
        segs.append(Segment(type: "song", label: label, start: start, end: start + dur, extra: ex))
    }
    print("   applause / songs / talk ...")
    applause("Opening applause", 0, 15, seed: 7101, attack: 0.3, tail: 0.35, endFade: 0, cheers: false)
    song("Song 1", 15, 60, bpm: 128, tonic: 9, minor: true, seed: 7201, fadeIn: 0.01, fadeOut: 1.0, segue: false)
    applause("Applause after song 1", 75, 8, seed: 7102, attack: 0.25, tail: 0.3, endFade: 0, cheers: false)
    // Talk (MC between songs), 83-95 s.
    do {
        var trng = RNG(7301)
        var talk = [Float](repeating: 0, count: Int(12 * SRd))
        let phr = fillPhrasesCS(15, 1175, minL: 150, maxL: 450, minP: 30, maxP: 80, rng: &trng)
        for (a, b) in phr { addSpeechPhrase(&talk, start: Double(a) / 100, end: Double(b) / 100, f0Base: 125, rng: &trng) }
        let r = speechRMS(talk, phr)
        let g = Float(dbToAmp(-26) / r)
        var st = Stereo(count: talk.count)
        for i in 0..<talk.count { st.L[i] = talk[i] * g; st.R[i] = talk[i] * g }
        put(st, 83)
        talkPhrases = phr.map { (83 + Double($0.0) / 100, 83 + Double($0.1) / 100) }
        segs.append(Segment(type: "talk", label: "MC talk", start: 83, end: 95,
                            extra: [("speech_level_dbfs_rms", .n(-26, 1)), ("phrase_count", .i(phr.count))]))
    }
    song("Song 2", 95, 75, bpm: 100, tonic: 7, minor: false, seed: 7202, fadeIn: 0.01, fadeOut: 1.0, segue: false)
    applause("Applause after song 2", 170, 6, seed: 7103, attack: 0.25, tail: 0.3, endFade: 0, cheers: false)
    song("Song 3", 176, 50, bpm: 140, tonic: 4, minor: true, seed: 7203, fadeIn: 0.01, fadeOut: 0.02, segue: false)
    song("Song 4", 226, 45, bpm: 90, tonic: 10, minor: false, seed: 7204, fadeIn: 0.02, fadeOut: 1.0, segue: true)
    applause("Closing applause + cheers", 271, 20, seed: 7104, attack: 0.3, tail: 0.45, endFade: 2.5, cheers: true)
    softClip(&mix)
    return (mix, segs, talkPhrases)
}

struct InterviewAudio {
    var stereo: Stereo
    var speech: [Float]
    var phrasesCS: [(Int, Int)]
    var longSilencesCS: [(Int, Int)]
}
func buildInterviewAudio() -> InterviewAudio {
    let n = 90 * SR
    var rng = RNG(1001)
    let longSil = [(1000, 1250), (3100, 3300), (5000, 5400), (7000, 7150)]
    let regions = [(60, 1000), (1250, 3100), (3300, 5000), (5400, 7000), (7150, 8940)]
    var phrases: [(Int, Int)] = []
    for (a, b) in regions { phrases += fillPhrasesCS(a, b, minL: 200, maxL: 800, minP: 30, maxP: 60, rng: &rng) }
    var speech = [Float](repeating: 0, count: n)
    for (a, b) in phrases { addSpeechPhrase(&speech, start: Double(a) / 100, end: Double(b) / 100, f0Base: 118, rng: &rng) }
    let r = speechRMS(speech, phrases)
    let g = Float(dbToAmp(-20) / r)
    for i in 0..<n { speech[i] *= g }
    var st = Stereo(count: n)
    for ch in 0..<2 {
        var room = pinkNoise(n, &rng)
        var lp = Biquad(.lowpass, 3000, 0.707), hp = Biquad(.highpass, 60, 0.707)
        for i in 0..<n { room[i] = Float(lp.process(hp.process(Double(room[i])))) }
        let rg = Float(dbToAmp(-60) / rmsOf(room))
        for i in 0..<n {
            let v = speech[i] + room[i] * rg
            if ch == 0 { st.L[i] = v } else { st.R[i] = v }
        }
    }
    return InterviewAudio(stereo: st, speech: speech, phrasesCS: phrases, longSilencesCS: longSil)
}

// MARK: - Video: H.264 writer

typealias FrameFn = (_ index: Int, _ dst: Px, _ bytesPerRow: Int) -> Void

func makeAudioSampleBuffer(_ st: Stereo, from a: Int, count n: Int, fmt: CMAudioFormatDescription) -> CMSampleBuffer? {
    var inter = [Float](repeating: 0, count: n * 2)
    for i in 0..<n where a + i < st.count { inter[2 * i] = st.L[a + i]; inter[2 * i + 1] = st.R[a + i] }
    let bytes = n * 8
    var bb: CMBlockBuffer?
    guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: bytes,
                                             blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0,
                                             dataLength: bytes, flags: kCMBlockBufferAssureMemoryNowFlag,
                                             blockBufferOut: &bb) == noErr, let block = bb else { return nil }
    let st2 = inter.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block, offsetIntoDestination: 0, dataLength: bytes) }
    guard st2 == noErr else { return nil }
    var sb: CMSampleBuffer?
    guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: block,
                                                               formatDescription: fmt, sampleCount: n,
                                                               presentationTimeStamp: CMTime(value: CMTimeValue(a), timescale: CMTimeScale(SR)),
                                                               packetDescriptions: nil, sampleBufferOut: &sb) == noErr else { return nil }
    return sb
}

func writeMovie(_ url: URL, frames: Int, audio: Stereo?, render: FrameFn) throws {
    try? FileManager.default.removeItem(at: url)
    let w = try AVAssetWriter(outputURL: url, fileType: .mp4)
    // No "fast start" rewrite: it is not needed for local editing and the rewrite can leave
    // `<name>.mp4.sb-XXXX` temp copies behind in sandboxed environments.
    w.shouldOptimizeForNetworkUse = false
    let vset: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: OW,
        AVVideoHeightKey: OH,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: VIDEO_BITRATE,
            AVVideoMaxKeyFrameIntervalKey: FPS,
            AVVideoMaxKeyFrameIntervalDurationKey: 1.0,
            AVVideoExpectedSourceFrameRateKey: FPS,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
        ] as [String: Any],
        AVVideoColorPropertiesKey: [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ],
    ]
    let vin = AVAssetWriterInput(mediaType: .video, outputSettings: vset)
    vin.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vin, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: OW,
        kCVPixelBufferHeightKey as String: OH,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ])
    guard w.canAdd(vin) else { throw GenError("cannot add video input") }
    w.add(vin)
    var ain: AVAssetWriterInput? = nil
    var afmt: CMAudioFormatDescription? = nil
    if audio != nil {
        var layout = AudioChannelLayout()
        layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
        let layoutData = withUnsafeBytes(of: &layout) { Data($0) }
        let aset: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: SR,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: AUDIO_BITRATE,
            AVChannelLayoutKey: layoutData,
        ]
        let a = AVAssetWriterInput(mediaType: .audio, outputSettings: aset)
        a.expectsMediaDataInRealTime = false
        guard w.canAdd(a) else { throw GenError("cannot add audio input") }
        w.add(a)
        ain = a
        var asbd = AudioStreamBasicDescription(mSampleRate: SRd, mFormatID: kAudioFormatLinearPCM,
                                               mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
                                               mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8,
                                               mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
        CMAudioFormatDescriptionCreate(allocator: kCFAllocatorDefault, asbd: &asbd, layoutSize: MemoryLayout<AudioChannelLayout>.size,
                                       layout: &layout, magicCookieSize: 0, magicCookie: nil, extensions: nil,
                                       formatDescriptionOut: &afmt)
    }
    guard w.startWriting() else { throw GenError("startWriting failed: \(String(describing: w.error))") }
    w.startSession(atSourceTime: .zero)
    let totalA = audio != nil ? frames * SAMPLES_PER_FRAME : 0
    let chunk = 4800
    var vi = 0, af = 0
    while vi < frames || af < totalA {
        var did = false
        if vi < frames && vin.isReadyForMoreMediaData {
            guard let pool = adaptor.pixelBufferPool else { throw GenError("no pixel buffer pool") }
            var pbo: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pbo)
            guard let pb = pbo else { throw GenError("pixel buffer alloc failed") }
            CVBufferSetAttachment(pb, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
            CVBufferSetAttachment(pb, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
            CVBufferSetAttachment(pb, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
            CVPixelBufferLockBaseAddress(pb, [])
            let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
            render(vi, base, CVPixelBufferGetBytesPerRow(pb))
            CVPixelBufferUnlockBaseAddress(pb, [])
            if !adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(vi), timescale: CMTimeScale(FPS))) {
                throw GenError("video append failed at frame \(vi): \(String(describing: w.error))")
            }
            vi += 1
            did = true
            if vi == frames { vin.markAsFinished() }
        }
        if let a = ain, let st = audio, let fmt = afmt, af < totalA, a.isReadyForMoreMediaData {
            let cnt = min(chunk, totalA - af)
            guard let sb = makeAudioSampleBuffer(st, from: af, count: cnt, fmt: fmt) else { throw GenError("audio sample buffer failed") }
            if !a.append(sb) { throw GenError("audio append failed: \(String(describing: w.error))") }
            af += cnt
            did = true
            if af == totalA { a.markAsFinished() }
        }
        if !did {
            if w.status == .failed { throw GenError("writer failed: \(String(describing: w.error))") }
            usleep(300)
        }
    }
    w.endSession(atSourceTime: CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(FPS)))
    let sem = DispatchSemaphore(value: 0)
    w.finishWriting { sem.signal() }
    sem.wait()
    if w.status != .completed { throw GenError("finishWriting failed: \(String(describing: w.error))") }
}

// MARK: - Video: pixel helpers

func makeBitmap(_ data: UnsafeMutableRawPointer?, _ w: Int, _ h: Int, _ bpr: Int) -> CGContext {
    CGContext(data: data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: bpr, space: srgb, bitmapInfo: bgraInfo)!
}
func flippedContext(_ dst: Px, _ bpr: Int, _ w: Int = OW, _ h: Int = OH) -> CGContext {
    let c = makeBitmap(dst, w, h, bpr)
    c.translateBy(x: 0, y: CGFloat(h)); c.scaleBy(x: 1, y: -1)
    return c
}
func allocFrame() -> Px { let p = Px.allocate(capacity: OW * OH * 4); p.initialize(repeating: 0, count: OW * OH * 4); return p }
func blitCrop(_ src: UnsafePointer<UInt8>, _ srcBpr: Int, x: Int, y: Int, _ dst: Px, _ dstBpr: Int) {
    for row in 0..<OH { memcpy(dst + row * dstBpr, src + (y + row) * srcBpr + x * 4, OW * 4) }
}
func copyFrame(_ src: UnsafePointer<UInt8>, _ dst: Px, _ dstBpr: Int) {
    if dstBpr == OW * 4 { memcpy(dst, src, OW * OH * 4); return }
    for row in 0..<OH { memcpy(dst + row * dstBpr, src + row * OW * 4, OW * 4) }
}
func gainLUT(_ g: Double, _ offset: Double = 0) -> [UInt8] {
    (0..<256).map { UInt8(clamp((Double($0) * g + offset).rounded(), 0, 255)) }
}
func applyLUT(_ dst: Px, _ bpr: Int, _ lut: [UInt8]) {
    lut.withUnsafeBufferPointer { L in
        for y in 0..<OH {
            let row = dst + y * bpr
            var i = 0
            while i < OW * 4 {
                row[i] = L[Int(row[i])]; row[i + 1] = L[Int(row[i + 1])]; row[i + 2] = L[Int(row[i + 2])]
                i += 4
            }
        }
    }
}
/// Draw the region `v` (scene pixel coords, y down) of the scene image so it fills the output frame,
/// optionally rotated about the frame centre.
func drawView(_ ctx: CGContext, _ img: CGImage, _ v: CGRect, rotationDeg: Double = 0) {
    let s = CGFloat(OW) / v.width
    ctx.saveGState()
    ctx.interpolationQuality = .high
    if rotationDeg != 0 {
        ctx.translateBy(x: CGFloat(OW) / 2, y: CGFloat(OH) / 2)
        ctx.rotate(by: CGFloat(rotationDeg * Double.pi / 180))
        ctx.translateBy(x: -CGFloat(OW) / 2, y: -CGFloat(OH) / 2)
    }
    let r = CGRect(x: -v.minX * s, y: CGFloat(OH) - (CGFloat(SH) - v.minY) * s, width: CGFloat(SW) * s, height: CGFloat(SH) * s)
    ctx.draw(img, in: r)
    ctx.restoreGState()
}

// Separable 3x box blur (approximately Gaussian, sigma ~= r*1.04 for r=12).
func boxBlur3(_ src: UnsafePointer<UInt8>, w: Int, h: Int, r: Int) -> Px {
    let bpr = w * 4
    let a = Px.allocate(capacity: bpr * h)
    a.initialize(from: src, count: bpr * h)
    let b = Px.allocate(capacity: bpr * h)
    b.initialize(repeating: 0, count: bpr * h)
    let d = 2 * r + 1, half = d / 2
    for _ in 0..<3 {
        for y in 0..<h {
            let rs = a + y * bpr, rd = b + y * bpr
            for c in 0..<4 {
                var sum = 0
                for k in -r...r { sum += Int(rs[clamp(k, 0, w - 1) * 4 + c]) }
                for x in 0..<w {
                    rd[x * 4 + c] = UInt8((sum + half) / d)
                    sum += Int(rs[min(x + r + 1, w - 1) * 4 + c]) - Int(rs[max(x - r, 0) * 4 + c])
                }
            }
        }
        var colSum = [Int](repeating: 0, count: bpr)
        for i in 0..<bpr {
            var s = 0
            for k in -r...r { s += Int(b[clamp(k, 0, h - 1) * bpr + i]) }
            colSum[i] = s
        }
        colSum.withUnsafeMutableBufferPointer { cs in
            for y in 0..<h {
                let rd = a + y * bpr
                let addRow = b + min(y + r + 1, h - 1) * bpr, subRow = b + max(y - r, 0) * bpr
                for i in 0..<bpr {
                    rd[i] = UInt8((cs[i] + half) / d)
                    cs[i] += Int(addRow[i]) - Int(subRow[i])
                }
            }
        }
    }
    b.deallocate()
    return a
}

// MARK: - Video: scene drawing

func drawText(_ ctx: CGContext, _ text: String, x: CGFloat, baseline y: CGFloat, size: CGFloat, fill: CGColor,
              stroke: CGColor? = nil, strokePct: Double = 4, font: String = "Helvetica-Bold") {
    let f = CTFontCreateWithName(font as CFString, size, nil)
    let kFont = NSAttributedString.Key(kCTFontAttributeName as String)
    let kFG = NSAttributedString.Key(kCTForegroundColorAttributeName as String)
    let kSW = NSAttributedString.Key(kCTStrokeWidthAttributeName as String)
    let kSC = NSAttributedString.Key(kCTStrokeColorAttributeName as String)
    func line(_ attrs: [NSAttributedString.Key: Any]) -> CTLine {
        CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs) as CFAttributedString)
    }
    ctx.saveGState()
    ctx.translateBy(x: x, y: y)
    ctx.scaleBy(x: 1, y: -1)
    ctx.textMatrix = .identity
    if let s = stroke {
        ctx.textPosition = .zero
        CTLineDraw(line([kFont: f, kSW: NSNumber(value: strokePct), kSC: s, kFG: s]), ctx)
    }
    ctx.textPosition = .zero
    CTLineDraw(line([kFont: f, kFG: fill]), ctx)
    ctx.restoreGState()
}
func siemensStar(_ ctx: CGContext, _ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, spokes: Int = 36) {
    ctx.setFillColor(col(1, 1, 1))
    ctx.fillEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
    ctx.setFillColor(col(0, 0, 0))
    for i in 0..<spokes {
        let a0 = CGFloat(i) * 2 * .pi / CGFloat(spokes), a1 = a0 + .pi / CGFloat(spokes)
        ctx.move(to: CGPoint(x: cx, y: cy))
        ctx.addArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: a0, endAngle: a1, clockwise: false)
        ctx.closePath()
    }
    ctx.fillPath()
    ctx.setStrokeColor(col(0, 0, 0)); ctx.setLineWidth(5)
    ctx.strokeEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
}
func resPatch(_ ctx: CGContext, _ x: CGFloat, _ y: CGFloat) {
    ctx.setFillColor(col(1, 1, 1)); ctx.fill(CGRect(x: x, y: y, width: 440, height: 160))
    ctx.setFillColor(col(0, 0, 0))
    var px = x + 10
    for period in [2, 4, 8] as [CGFloat] {
        var bx = px
        while bx < px + 60 { ctx.fill(CGRect(x: bx, y: y + 10, width: period / 2, height: 140)); bx += period }
        px += 70
        var by = y + 10
        while by < y + 150 { ctx.fill(CGRect(x: px, y: by, width: 60, height: period / 2)); by += period }
        px += 70
    }
}
func stageLight(_ ctx: CGContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ c: (Double, Double, Double)) {
    let g = CGGradient(colorsSpace: srgb, colors: [col(1, 1, 0.97, 1), col(c.0, c.1, c.2, 0.85), col(c.0, c.1, c.2, 0)] as CFArray,
                       locations: [0, 0.3, 1])!
    ctx.saveGState()
    ctx.setBlendMode(.screen)
    ctx.drawRadialGradient(g, startCenter: CGPoint(x: x, y: y), startRadius: 0, endCenter: CGPoint(x: x, y: y), endRadius: r, options: [])
    ctx.restoreGState()
    ctx.setFillColor(col(1, 1, 1))
    ctx.fillEllipse(in: CGRect(x: x - r * 0.16, y: y - r * 0.16, width: r * 0.32, height: r * 0.32))
}
func beam(_ ctx: CGContext, _ x: CGFloat, _ y: CGFloat, toY: CGFloat, spread: CGFloat, _ c: (Double, Double, Double), alpha: Double) {
    ctx.saveGState()
    ctx.setBlendMode(.screen)
    ctx.move(to: CGPoint(x: x - 18, y: y)); ctx.addLine(to: CGPoint(x: x + 18, y: y))
    ctx.addLine(to: CGPoint(x: x + spread, y: toY)); ctx.addLine(to: CGPoint(x: x - spread, y: toY))
    ctx.closePath()
    ctx.clip()
    let g = CGGradient(colorsSpace: srgb, colors: [col(c.0, c.1, c.2, alpha), col(c.0, c.1, c.2, 0)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(g, start: CGPoint(x: x, y: y), end: CGPoint(x: x, y: toY), options: [])
    ctx.restoreGState()
}

struct Scene { let data: Px; let image: CGImage; let blurred: Px }

func renderScene() -> Scene {
    let bpr = SW * 4
    let data = Px.allocate(capacity: bpr * SH)
    data.initialize(repeating: 0, count: bpr * SH)
    let ctx = flippedContext(data, bpr, SW, SH)
    var rng = RNG(0xC0_77_20_26)
    let W = CGFloat(SW), H = CGFloat(SH)
    // 1. backdrop gradient
    let bg = CGGradient(colorsSpace: srgb, colors: [col(0.20, 0.22, 0.30), col(0.40, 0.39, 0.43), col(0.52, 0.48, 0.44)] as CFArray,
                        locations: [0, 0.5, 1])!
    ctx.drawLinearGradient(bg, start: .zero, end: CGPoint(x: 0, y: H), options: [])
    // 2. checkerboard (160 px)
    for gy in 0..<(SH / 160 + 1) {
        for gx in 0..<(SW / 160) {
            ctx.setFillColor((gx + gy) % 2 == 0 ? col(1, 1, 1, 0.12) : col(0, 0, 0, 0.12))
            ctx.fill(CGRect(x: gx * 160, y: gy * 160, width: 160, height: 160))
        }
    }
    // 3. fine grid (2 px dark lines every 32 px) + bright 3 px lines every 160 px
    ctx.setFillColor(col(0.04, 0.04, 0.05, 0.5))
    for x in stride(from: 0, to: SW, by: 32) { ctx.fill(CGRect(x: x, y: 0, width: 2, height: SH)) }
    for y in stride(from: 0, to: SH, by: 32) { ctx.fill(CGRect(x: 0, y: y, width: SW, height: 2)) }
    ctx.setFillColor(col(0.95, 0.95, 0.95, 0.65))
    for x in stride(from: 0, to: SW, by: 160) { ctx.fill(CGRect(x: x, y: 0, width: 3, height: SH)) }
    for y in stride(from: 0, to: SH, by: 160) { ctx.fill(CGRect(x: 0, y: y, width: SW, height: 3)) }
    // 4. random rectangles
    for _ in 0..<260 {
        let w = rng.range(40, 340), h = rng.range(30, 260)
        let rect = CGRect(x: rng.range(-40, Double(SW)), y: rng.range(-40, Double(SH)), width: w, height: h)
        let c = hsv(rng.uniform(), rng.range(0.4, 1.0), rng.range(0.35, 1.0))
        if rng.chance(0.6) {
            ctx.setFillColor(col(c.0, c.1, c.2, rng.range(0.6, 0.95))); ctx.fill(rect)
        } else {
            ctx.setStrokeColor(col(c.0, c.1, c.2)); ctx.setLineWidth(rng.range(3, 10)); ctx.stroke(rect)
        }
    }
    // 5. circles / rings
    for _ in 0..<150 {
        let rad = rng.range(18, 170), cx = rng.range(0, Double(SW)), cy = rng.range(0, Double(SH))
        let c = hsv(rng.uniform(), rng.range(0.3, 1.0), rng.range(0.4, 1.0))
        let rect = CGRect(x: cx - rad, y: cy - rad, width: 2 * rad, height: 2 * rad)
        if rng.chance(0.35) {
            ctx.setFillColor(col(c.0, c.1, c.2, rng.range(0.6, 0.95))); ctx.fillEllipse(in: rect)
        } else {
            ctx.setStrokeColor(col(c.0, c.1, c.2)); ctx.setLineWidth(rng.range(3, 9)); ctx.strokeEllipse(in: rect)
        }
        if rng.chance(0.2) {
            ctx.setStrokeColor(col(1, 1, 1, 0.9)); ctx.setLineWidth(3)
            for k in 1..<5 { let rr = rad * Double(k) / 5; ctx.strokeEllipse(in: CGRect(x: cx - rr, y: cy - rr, width: 2 * rr, height: 2 * rr)) }
        }
    }
    // 6. stage floor (planks)
    let floorY: CGFloat = 1660
    ctx.setFillColor(col(0.36, 0.25, 0.16, 0.9)); ctx.fill(CGRect(x: 0, y: floorY, width: W, height: H - floorY))
    ctx.setFillColor(col(0.12, 0.08, 0.05, 0.9))
    var py = floorY
    while py < H {
        ctx.fill(CGRect(x: 0, y: py, width: W, height: 3))
        for _ in 0..<12 { ctx.fill(CGRect(x: rng.range(0, Double(SW)), y: Double(py), width: 3, height: 34)) }
        py += 34
    }
    // 7. lighting truss
    ctx.setFillColor(col(0.15, 0.15, 0.17)); ctx.fill(CGRect(x: 0, y: 110, width: W, height: 44))
    ctx.setStrokeColor(col(0.6, 0.6, 0.65)); ctx.setLineWidth(4)
    var tx: CGFloat = 0
    while tx < W { ctx.move(to: CGPoint(x: tx, y: 112)); ctx.addLine(to: CGPoint(x: tx + 44, y: 152)); tx += 44 }
    ctx.strokePath()
    // 8. test targets
    for (x, y, r) in [(2950.0, 1150.0, 150.0), (1560, 1580, 110), (700, 650, 160), (3500, 1300, 140), (300, 1350, 120), (2200, 450, 130)] {
        siemensStar(ctx, x, y, r)
    }
    for (x, y) in [(2560.0, 1330.0), (500, 900), (3300, 600), (1900, 1850)] { resPatch(ctx, x, y) }
    // 9. light beams from the truss
    let palette: [(Double, Double, Double)] = [(1, 0.85, 0.6), (1, 0.3, 0.8), (0.3, 0.8, 1), (1, 0.6, 0.2), (0.4, 0.5, 1)]
    for k in 0..<9 { beam(ctx, CGFloat(250 + k * 425), 210, toY: floorY, spread: 300, palette[k % 5], alpha: 0.16) }
    // 10. text labels
    let white = col(1, 1, 1), black = col(0, 0, 0)
    drawText(ctx, "MAIN STAGE", x: 1430, baseline: 1110, size: 200, fill: white, stroke: black)
    drawText(ctx, "CUTROOM 2026", x: 1420, baseline: 1460, size: 150, fill: col(1, 0.9, 0.3), stroke: black)
    drawText(ctx, "TEST CHART A1", x: 1760, baseline: 1625, size: 80, fill: white, stroke: black)
    ctx.setFillColor(col(0, 0, 0, 0.75)); ctx.fill(CGRect(x: 1310, y: 1166, width: 1200, height: 92))
    drawText(ctx, "THE QUICK BROWN FOX JUMPS OVER 0123456789", x: 1325, baseline: 1200, size: 34, fill: white, font: "Helvetica")
    drawText(ctx, "focus / sharpness reference  —  ABCDEFGHIJKLMNOPQRSTUVWXYZ", x: 1325, baseline: 1244, size: 28, fill: white, font: "Helvetica")
    drawText(ctx, "STAGE LEFT", x: 120, baseline: 560, size: 150, fill: white, stroke: black)
    drawText(ctx, "STAGE RIGHT", x: 2950, baseline: 520, size: 130, fill: white, stroke: black)
    drawText(ctx, "FRONT OF HOUSE", x: 150, baseline: 2080, size: 110, fill: white, stroke: black)
    drawText(ctx, "B2", x: 3550, baseline: 2050, size: 160, fill: col(0.3, 1, 0.5), stroke: black)
    // 11. stage lights (bright blobs)
    for k in 0..<9 { stageLight(ctx, CGFloat(250 + k * 425), 210, 170, palette[k % 5]) }
    for (k, x) in [1420.0, 1880, 2340, 2800, 3260].enumerated() { stageLight(ctx, x, 790, 120, palette[(k + 2) % 5]) }
    for (k, x) in [650.0, 1500, 2450, 3350].enumerated() { stageLight(ctx, x, 1880, 190, palette[(k + 1) % 5]) }
    ctx.flush()
    // 12. dark "wing": top-left region darkened to 25 % with feathered edges.
    var wx = [Float](repeating: 0, count: SW), wy = [Float](repeating: 0, count: SH)
    for x in 0..<SW { wx[x] = Float(1 - smoothstep((Double(x) - 1500) / 400)) }
    for y in 0..<SH { wy[y] = Float(1 - smoothstep((Double(y) - 850) / 300)) }
    for y in 0..<SH where wy[y] > 0 {
        let row = data + y * bpr
        for x in 0..<SW where wx[x] > 0 {
            let f = 1 - 0.75 * wx[x] * wy[y]
            for c in 0..<3 { row[x * 4 + c] = UInt8((Float(row[x * 4 + c]) * f).rounded()) }
        }
    }
    let img = makeBitmap(data, SW, SH, bpr).makeImage()!
    let blurred = boxBlur3(data, w: SW, h: SH, r: 12)
    return Scene(data: data, image: img, blurred: blurred)
}

func renderInterviewBase() -> Px {
    let buf = allocFrame()
    let ctx = flippedContext(buf, OW * 4)
    var rng = RNG(9001)
    // wall
    let wall = CGGradient(colorsSpace: srgb, colors: [col(0.62, 0.56, 0.50), col(0.44, 0.40, 0.36)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(wall, start: .zero, end: CGPoint(x: 0, y: OH), options: [])
    ctx.setFillColor(col(1, 1, 1, 0.05))
    for x in stride(from: 0, to: OW, by: 28) { ctx.fill(CGRect(x: x, y: 0, width: 12, height: OH)) }
    // bookshelf
    ctx.setFillColor(col(0.45, 0.30, 0.18)); ctx.fill(CGRect(x: 80, y: 140, width: 560, height: 860))
    ctx.setFillColor(col(0.22, 0.15, 0.09)); ctx.fill(CGRect(x: 100, y: 160, width: 520, height: 820))
    for s in 0..<5 {
        let shelfY = CGFloat(160 + s * 165)
        var bx: CGFloat = 104
        while bx < 600 {
            let bw = CGFloat(rng.range(16, 48)), bh = CGFloat(rng.range(110, 150))
            if bx + bw > 616 { break }
            let c = hsv(rng.uniform(), rng.range(0.3, 0.8), rng.range(0.35, 0.85))
            ctx.setFillColor(col(c.0, c.1, c.2)); ctx.fill(CGRect(x: bx, y: shelfY + 150 - bh, width: bw, height: bh))
            ctx.setFillColor(col(1, 1, 1, 0.5)); ctx.fill(CGRect(x: bx + 3, y: shelfY + 150 - bh + 20, width: bw - 6, height: 3))
            bx += bw + CGFloat(rng.range(1, 4))
        }
        ctx.setFillColor(col(0.45, 0.30, 0.18)); ctx.fill(CGRect(x: 80, y: shelfY + 150, width: 560, height: 15))
    }
    // window
    ctx.setFillColor(col(0.92, 0.92, 0.9)); ctx.fill(CGRect(x: 1440, y: 130, width: 400, height: 480))
    let sky = CGGradient(colorsSpace: srgb, colors: [col(0.78, 0.88, 0.97), col(0.55, 0.72, 0.92)] as CFArray, locations: [0, 1])!
    ctx.saveGState(); ctx.clip(to: CGRect(x: 1460, y: 150, width: 360, height: 440))
    ctx.drawLinearGradient(sky, start: CGPoint(x: 0, y: 150), end: CGPoint(x: 0, y: 590), options: [])
    ctx.restoreGState()
    ctx.setFillColor(col(0.92, 0.92, 0.9))
    ctx.fill(CGRect(x: 1632, y: 150, width: 16, height: 440)); ctx.fill(CGRect(x: 1460, y: 362, width: 360, height: 16))
    // plant
    ctx.setFillColor(col(0.70, 0.36, 0.22)); ctx.fill(CGRect(x: 1600, y: 860, width: 160, height: 220))
    for _ in 0..<14 {
        ctx.saveGState()
        ctx.translateBy(x: CGFloat(rng.range(1620, 1740)), y: CGFloat(rng.range(700, 860)))
        ctx.rotate(by: CGFloat(rng.range(-1.2, 1.2)))
        let g = rng.range(0.35, 0.6)
        ctx.setFillColor(col(0.15, g, 0.2)); ctx.fillEllipse(in: CGRect(x: -25, y: -110, width: 50, height: 120))
        ctx.restoreGState()
    }
    // person: torso, neck, head, hair, ears, eyes, brows, nose
    ctx.setFillColor(col(0.12, 0.16, 0.28))
    ctx.move(to: CGPoint(x: 560, y: 1080))
    ctx.addCurve(to: CGPoint(x: 960, y: 760), control1: CGPoint(x: 600, y: 840), control2: CGPoint(x: 760, y: 765))
    ctx.addCurve(to: CGPoint(x: 1360, y: 1080), control1: CGPoint(x: 1160, y: 765), control2: CGPoint(x: 1320, y: 840))
    ctx.closePath(); ctx.fillPath()
    ctx.setFillColor(col(0.78, 0.60, 0.50)); ctx.fill(CGRect(x: 905, y: 620, width: 110, height: 170))
    ctx.setFillColor(col(0.92, 0.92, 0.95))
    ctx.move(to: CGPoint(x: 885, y: 770)); ctx.addLine(to: CGPoint(x: 1035, y: 770)); ctx.addLine(to: CGPoint(x: 960, y: 900)); ctx.closePath(); ctx.fillPath()
    ctx.setFillColor(col(0.83, 0.65, 0.55))
    ctx.fillEllipse(in: CGRect(x: 783, y: 435, width: 44, height: 90)); ctx.fillEllipse(in: CGRect(x: 1093, y: 435, width: 44, height: 90))
    let head = CGRect(x: 810, y: 275, width: 300, height: 390)
    ctx.setFillColor(col(0.88, 0.71, 0.60)); ctx.fillEllipse(in: head)
    ctx.saveGState(); ctx.addEllipse(in: head); ctx.clip()
    ctx.setFillColor(col(0.20, 0.13, 0.08)); ctx.fill(CGRect(x: 800, y: 260, width: 320, height: 105))
    ctx.restoreGState()
    ctx.setFillColor(col(0.20, 0.13, 0.08)); ctx.fill(CGRect(x: 873, y: 400, width: 64, height: 9)); ctx.fill(CGRect(x: 983, y: 400, width: 64, height: 9))
    for ex in [905.0, 1015.0] {
        ctx.setFillColor(col(0.97, 0.97, 0.97)); ctx.fillEllipse(in: CGRect(x: ex - 26, y: 432, width: 52, height: 26))
        ctx.setFillColor(col(0.30, 0.20, 0.12)); ctx.fillEllipse(in: CGRect(x: ex - 10, y: 435, width: 20, height: 20))
        ctx.setFillColor(col(0.02, 0.02, 0.02)); ctx.fillEllipse(in: CGRect(x: ex - 5, y: 440, width: 10, height: 10))
        ctx.setFillColor(col(1, 1, 1)); ctx.fillEllipse(in: CGRect(x: ex + 1, y: 440, width: 4, height: 4))
    }
    ctx.setStrokeColor(col(0.62, 0.45, 0.38)); ctx.setLineWidth(5)
    ctx.move(to: CGPoint(x: 962, y: 455)); ctx.addLine(to: CGPoint(x: 945, y: 525)); ctx.addLine(to: CGPoint(x: 972, y: 530)); ctx.strokePath()
    // lower third
    ctx.setFillColor(col(0, 0, 0, 0.62)); ctx.fill(CGRect(x: 100, y: 880, width: 820, height: 120))
    ctx.setFillColor(col(1, 0.55, 0.1)); ctx.fill(CGRect(x: 100, y: 880, width: 12, height: 120))
    drawText(ctx, "SUBJECT A", x: 140, baseline: 935, size: 52, fill: col(1, 1, 1))
    drawText(ctx, "Festival interview  ·  Cutroom test media", x: 140, baseline: 980, size: 30, fill: col(0.85, 0.85, 0.85), font: "Helvetica")
    return buf
}

// MARK: - Generation

struct ClipInfo { let file: String; let frames: Int }

func generateAll() throws {
    for d in [outRoot, concertDir, interviewDir, audioDir] { ensureDir(d) }
    let t0 = Date()
    func stamp() -> String { f2(Date().timeIntervalSince(t0), 1) + "s" }

    // ---------- audio/ ----------
    print("[\(stamp())] audio/music_120bpm.wav")
    let spec120 = SongSpec(bpm: 120, duration: 40, tonic: 9, minor: true, melody: false, bass: false, seed: 120,
                           firstBeat: 0.5, fadeIn: 0, fadeOut: 0.3)
    var (m120, b120) = synthSong(spec120)
    normalizePeak(&m120, -1)
    try writeWAV(audioDir.appendingPathComponent("music_120bpm.wav"), m120)
    try writeJSON(musicTruth(file: "music_120bpm.wav", spec: spec120, beats: b120), audioDir.appendingPathComponent("music_120bpm_truth.json"))

    print("[\(stamp())] audio/music_92bpm.wav")
    let spec92 = SongSpec(bpm: 92, duration: 30, tonic: 0, minor: false, melody: false, bass: false, seed: 92,
                          firstBeat: 0.25, fadeIn: 0, fadeOut: 0.3)
    var (m92, b92) = synthSong(spec92)
    normalizePeak(&m92, -1)
    try writeWAV(audioDir.appendingPathComponent("music_92bpm.wav"), m92)
    try writeJSON(musicTruth(file: "music_92bpm.wav", spec: spec92, beats: b92), audioDir.appendingPathComponent("music_92bpm_truth.json"))

    print("[\(stamp())] audio/concert_set.wav")
    let (concert, segs, talkPhr) = buildConcert()
    try writeWAV(audioDir.appendingPathComponent("concert_set.wav"), concert)
    let segJ: [J] = segs.enumerated().map { (i, s) in
        .o([("index", .i(i + 1)), ("type", .s(s.type)), ("label", .s(s.label)), ("start", .n(s.start, 3)), ("end", .n(s.end, 3)),
            ("duration", .n(s.end - s.start, 3))] + s.extra)
    }
    try writeJSON(.o([
        ("file", .s("concert_set.wav")),
        ("duration", .n(Double(concert.count) / SRd, 3)),
        ("sample_rate", .i(SR)),
        ("levels", .s("songs -14 dBFS RMS, applause -18 dBFS RMS, talk -26 dBFS RMS (over phrases), crowd/room bed -42 dBFS RMS throughout (never digital silence)")),
        ("notes", .s("Boundaries are exact sample positions of the synthesized parts. Songs before applause fade out over their last 1.0 s; song 3 runs straight into song 4 (20 ms crossfade, tempo 140->90 BPM, key E minor -> Bb major). Applause swells in over ~0.3 s and decays to ~30-45 % before the next part. Song beats: first_beat + k*60/bpm.")),
        ("segments", .a(segJ)),
        ("talk_phrases", .a(talkPhr.map { span($0.0, $0.1, 2) })),
    ]), audioDir.appendingPathComponent("concert_set_truth.json"))

    // ---------- interview audio ----------
    print("[\(stamp())] interview audio")
    let iv = buildInterviewAudio()

    // ---------- scene ----------
    print("[\(stamp())] rendering 3840x2160 scene + blur")
    let scene = renderScene()
    let sbpr = SW * 4
    let fGood = allocFrame(); blitCrop(scene.data, sbpr, x: DEF_X, y: DEF_Y, fGood, OW * 4)
    let fBlur = allocFrame(); blitCrop(scene.blurred, sbpr, x: DEF_X, y: DEF_Y, fBlur, OW * 4)
    let fDark = allocFrame(); copyFrame(fGood, fDark, OW * 4); applyLUT(fDark, OW * 4, gainLUT(0.10))
    let fOver = allocFrame(); copyFrame(fGood, fOver, OW * 4); applyLUT(fOver, OW * 4, gainLUT(3.2, 70))
    let fDup = allocFrame(); blitCrop(scene.data, sbpr, x: DEF_X + 2, y: DEF_Y + 1, fDup, OW * 4)
    let fFull = allocFrame()
    drawView(makeBitmap(fFull, OW, OH, OW * 4), scene.image, CGRect(x: 0, y: 0, width: SW, height: SH))
    let fInterview = renderInterviewBase()

    func crowd(_ seed: UInt64, _ secs: Double) -> Stereo { synthCrowd(duration: secs, seed: seed, voices: 8, rmsDB: -30) }
    func shakyDraw(_ rng: inout RNG, _ dst: Px, _ bpr: Int) {
        let dx = rng.range(-25, 25), dy = rng.range(-25, 25), rot = rng.range(-0.6, 0.6)
        drawView(makeBitmap(dst, OW, OH, bpr), scene.image,
                 CGRect(x: Double(DEF_X) + dx, y: Double(DEF_Y) + dy, width: Double(OW), height: Double(OH)), rotationDeg: rot)
    }
    func movie(_ dir: URL, _ name: String, _ frames: Int, _ audio: Stereo, _ fn: FrameFn) throws {
        let t = Date()
        try writeMovie(dir.appendingPathComponent(name), frames: frames, audio: audio, render: fn)
        print("[\(stamp())] \(dir.lastPathComponent)/\(name)  (\(f2(Date().timeIntervalSince(t), 1)) s)")
    }

    // ---------- concert/ ----------
    try movie(concertDir, "C001_sharp_static.mp4", 250, crowd(101, 10)) { _, d, b in copyFrame(fGood, d, b) }
    try movie(concertDir, "C002_blurry.mp4", 250, crowd(102, 10)) { _, d, b in copyFrame(fBlur, d, b) }
    try movie(concertDir, "C003_dark.mp4", 250, crowd(103, 10)) { _, d, b in copyFrame(fDark, d, b) }
    try movie(concertDir, "C004_overexposed.mp4", 250, crowd(104, 10)) { _, d, b in copyFrame(fOver, d, b) }
    var shakeRng = RNG(5005)
    try movie(concertDir, "C005_shaky.mp4", 250, crowd(105, 10)) { _, d, b in shakyDraw(&shakeRng, d, b) }

    // Whip pan: steady 0-4 s, smoothstep pan of +1500 px over 4.0-4.6 s, steady after. 180° shutter blur.
    let wpX0 = 300.0, wpY = 1050, wpDX = 1500.0
    func panX(_ t: Double) -> Double { wpX0 + wpDX * smoothstep((t - 4.0) / 0.6) }
    let acc = UnsafeMutablePointer<UInt32>.allocate(capacity: OW * OH * 4)
    defer { acc.deallocate() }
    try movie(concertDir, "C006_whip_pan.mp4", 250, crowd(106, 10)) { i, d, b in
        let ta = Double(i) / Double(FPS), tb = ta + 0.5 / Double(FPS)
        if abs(panX(tb) - panX(ta)) < 0.5 {
            blitCrop(scene.data, sbpr, x: Int(panX(ta).rounded()), y: wpY, d, b)
            return
        }
        let N = 24
        acc.initialize(repeating: 0, count: OW * OH * 4)
        for k in 0..<N {
            let x = Int(panX(ta + (Double(k) + 0.5) / Double(N) * (tb - ta)).rounded())
            for row in 0..<OH {
                let s = scene.data + (wpY + row) * sbpr + x * 4, a = acc + row * OW * 4
                for q in 0..<(OW * 4) { a[q] &+= UInt32(s[q]) }
            }
        }
        for row in 0..<OH {
            let a = acc + row * OW * 4, o = d + row * b
            for q in 0..<(OW * 4) { o[q] = UInt8((a[q] + UInt32(N / 2)) / UInt32(N)) }
        }
    }

    // Reveal: zoom 2x -> 1x anchored at the scene's top-left (dark wing), brightness 15 % -> 100 %, over 0-8 s.
    try movie(concertDir, "C007_reveal_pullback.mp4", 250, crowd(107, 10)) { i, d, b in
        let t = Double(i) / Double(FPS)
        let s = smoothstep(t / 8)
        let k = 0.5 + 0.5 * s
        drawView(makeBitmap(d, OW, OH, b), scene.image, CGRect(x: 0, y: 0, width: Double(SW) * k, height: Double(SH) * k))
        let g = 0.15 + 0.85 * s
        if g < 0.999 { applyLUT(d, b, gainLUT(g)) }
    }
    try movie(concertDir, "C008_duplicate_of_C001.mp4", 250, crowd(101, 10)) { _, d, b in copyFrame(fDup, d, b) }
    try movie(concertDir, "C009_slow_pan_good.mp4", 250, crowd(109, 10)) { i, d, b in
        let x = DEF_X - 150 + Int((30.0 * Double(i) / Double(FPS)).rounded())
        blitCrop(scene.data, sbpr, x: x, y: DEF_Y, d, b)
    }
    var shake10 = RNG(10010)
    try movie(concertDir, "C010_mixed.mp4", 500, crowd(110, 20)) { i, d, b in
        switch i {
        case 0..<75: shakyDraw(&shake10, d, b)
        case 75..<375: copyFrame(fGood, d, b)
        case 375..<425: copyFrame(fBlur, d, b)
        default: copyFrame(fDark, d, b)
        }
    }
    // Long concert clip: wide shot with slowly cycling coloured light pools; audio = concert_set 0-120 s.
    let pools: [(x: Double, y: Double, r: Double, h0: Double, ph: Double, k: Double)] = [
        (330, 200, 420, 0.00, 0.3, 1.0), (780, 260, 380, 0.22, 1.7, 1.0), (1180, 240, 400, 0.45, 2.9, 1.0),
        (1620, 220, 420, 0.68, 4.1, 1.0), (960, 860, 650, 0.85, 5.3, 0.6),
    ]
    try movie(concertDir, "C011_concert_long.mp4", 3000, concert.slice(0, 120 * SR)) { i, d, b in
        copyFrame(fFull, d, b)
        let t = Double(i) / Double(FPS)
        let ctx = flippedContext(d, b)
        ctx.setBlendMode(.screen)
        for (n, p) in pools.enumerated() {
            let h = p.h0 + t / 45 + 0.08 * sin(2 * Double.pi * t / 29 + p.ph)
            let a = (0.32 + 0.14 * sin(2 * Double.pi * t / (13 + 3 * Double(n)) + p.ph)) * p.k
            let c = hsv(h, 0.85, 1)
            let g = CGGradient(colorsSpace: srgb, colors: [col(c.0, c.1, c.2, a), col(c.0, c.1, c.2, a * 0.45), col(c.0, c.1, c.2, 0)] as CFArray,
                               locations: [0, 0.45, 1])!
            ctx.drawRadialGradient(g, startCenter: CGPoint(x: p.x, y: p.y), startRadius: 0, endCenter: CGPoint(x: p.x, y: p.y),
                                   endRadius: CGFloat(p.r), options: [])
        }
    }

    // ---------- interview/ ----------
    var mouth = [Double](repeating: 0, count: 90 * FPS)
    for f in 0..<mouth.count {
        let r = rmsOf(iv.speech, f * SAMPLES_PER_FRAME, (f + 1) * SAMPLES_PER_FRAME)
        mouth[f] = pow(clamp(r / 0.14, 0.0, 1.0), 0.7)
    }
    try movie(interviewDir, "I001_interview.mp4", 90 * FPS, iv.stereo) { i, d, b in
        copyFrame(fInterview, d, b)
        let ctx = flippedContext(d, b)
        let o = mouth[i]
        let h = 6 + 30 * o, w = 76 - 10 * o
        ctx.setFillColor(col(0.70, 0.36, 0.36)); ctx.fillEllipse(in: CGRect(x: 960 - w / 2 - 6, y: 585 - h / 2 - 5, width: w + 12, height: h + 10))
        ctx.setFillColor(col(0.30, 0.06, 0.07)); ctx.fillEllipse(in: CGRect(x: 960 - w / 2, y: 585 - h / 2, width: w, height: h))
    }
    let phr = iv.phrasesCS
    var pauses: [J] = []
    for k in 1..<phr.count {
        let a = phr[k - 1].1, b = phr[k].0
        if !iv.longSilencesCS.contains(where: { $0.0 == a && $0.1 == b }) { pauses.append(span(Double(a) / 100, Double(b) / 100, 2)) }
    }
    try writeJSON(.o([
        ("file", .s("I001_interview.mp4")),
        ("duration", .n(90, 3)),
        ("sample_rate", .i(SR)),
        ("speech_level_dbfs_rms", .n(-20, 1)),
        ("room_noise_dbfs_rms", .n(-60, 1)),
        ("notes", .s("Times in seconds on a 10 ms grid. Phrase start/end are the syllable-envelope boundaries (sin^0.6 envelope; energy is above -40 dBFS within ~10-30 ms of them). Everything outside phrases is faint pink room noise (-60 dBFS RMS, independent per channel); speech is identical in L and R. Video is a static talking head; only the mouth opening follows the speech envelope.")),
        ("long_silences", .a(iv.longSilencesCS.map { span(Double($0.0) / 100, Double($0.1) / 100, 2) })),
        ("leading_silence", span(0, Double(phr[0].0) / 100, 2)),
        ("trailing_silence", span(Double(phr[phr.count - 1].1) / 100, 90, 2)),
        ("phrase_count", .i(phr.count)),
        ("phrases", .a(phr.enumerated().map { (k, p) in
            .o([("index", .i(k + 1)), ("start", .n(Double(p.0) / 100, 2)), ("end", .n(Double(p.1) / 100, 2)), ("duration", .n(Double(p.1 - p.0) / 100, 2))])
        })),
        ("short_pauses", .a(pauses)),
    ]), interviewDir.appendingPathComponent("I001_truth.json"))

    // ---------- concert/clips_truth.json ----------
    let c011Segs: [J] = segs.filter { $0.start < 120 }.map { s in
        .o([("type", .s(s.type)), ("label", .s(s.label)), ("start", .n(s.start, 3)), ("end", .n(min(s.end, 120), 3)),
            ("truncated", .b(s.end > 120))])
    }
    func clip(_ file: String, _ dur: Double, _ labels: [(String, J)], _ extra: [(String, J)] = []) -> J {
        .o([("file", .s(file)), ("duration", .n(dur, 3)), ("frames", .i(Int(dur) * FPS)), ("labels", .o(labels))] + extra)
    }
    let good: [(String, J)] = [("focus", .s("sharp")), ("exposure", .s("normal")), ("stability", .s("steady"))]
    try writeJSON(.o([
        ("scene", .s("3840x2160 synthetic stage, rendered once. 'Default view' = 1:1 crop at x=1280,y=700 (1920x1080). Dark wing: top-left of the scene (x<1500, y<850 at 25 % brightness, feathered to x=1900, y=1150).")),
        ("audio", .s("C001-C010: soft crowd babble + pink bed, -30 dBFS RMS, AAC 48 kHz stereo. C008 audio is identical to C001.")),
        ("clips", .a([
            clip("C001_sharp_static.mp4", 10, good + [("motion", .s("static"))], [("camera", .s("static, default view"))]),
            clip("C002_blurry.mp4", 10, [("focus", .s("blurry")), ("exposure", .s("normal")), ("stability", .s("steady"))],
                 [("blur", .s("3x box blur r=12 px on the 2x scene, shown 1:1 (~Gaussian sigma 12.5 px at 1080p), whole clip"))]),
            clip("C003_dark.mp4", 10, [("focus", .s("sharp")), ("exposure", .s("underexposed")), ("stability", .s("steady"))],
                 [("exposure_gain", .n(0.10, 2))]),
            clip("C004_overexposed.mp4", 10, [("focus", .s("sharp")), ("exposure", .s("overexposed")), ("stability", .s("steady"))],
                 [("transfer", .s("v' = min(255, 70 + 3.2*v) per 8-bit channel"))]),
            clip("C005_shaky.mp4", 10, [("focus", .s("sharp")), ("exposure", .s("normal")), ("stability", .s("shaky"))],
                 [("shake", .s("independent uniform random per frame: dx,dy in [-25,25] px, rotation in [-0.6,0.6] deg (seeded)"))]),
            clip("C006_whip_pan.mp4", 10, good, [
                ("events", .a([.o([("type", .s("whip_pan")), ("start", .n(4.0, 2)), ("end", .n(4.6, 2)), ("displacement_px", .i(1500)),
                                   ("direction", .s("camera pans right, image content moves left")),
                                   ("easing", .s("smoothstep; 180-degree shutter motion blur, 24 sub-samples/frame"))])])),
                ("segments", .a([.o([("start", .n(0, 2)), ("end", .n(4.0, 2)), ("label", .s("good"))]),
                                 .o([("start", .n(4.0, 2)), ("end", .n(4.6, 2)), ("label", .s("whip_pan"))]),
                                 .o([("start", .n(4.6, 2)), ("end", .n(10, 2)), ("label", .s("good"))])])),
            ]),
            clip("C007_reveal_pullback.mp4", 10, [("focus", .s("sharp")), ("exposure", .s("dark -> normal")), ("stability", .s("smooth zoom"))], [
                ("zoom", .o([("from", .n(2, 2)), ("to", .n(1, 2)), ("start", .n(0, 2)), ("end", .n(8, 2)), ("easing", .s("smoothstep")),
                             ("anchor", .s("scene top-left corner (dark wing)"))])),
                ("brightness_gain", .o([("from", .n(0.15, 2)), ("to", .n(1, 2)), ("start", .n(0, 2)), ("end", .n(8, 2)), ("easing", .s("smoothstep"))])),
                ("segments", .a([.o([("start", .n(0, 2)), ("end", .n(8, 2)), ("label", .s("reveal"))]),
                                 .o([("start", .n(8, 2)), ("end", .n(10, 2)), ("label", .s("hold (wide, normal exposure)"))])])),
            ]),
            clip("C008_duplicate_of_C001.mp4", 10, good + [("motion", .s("static"))], [
                ("duplicate_of", .s("C001_sharp_static.mp4")),
                ("offset_px", .o([("x", .i(2)), ("y", .i(1))])),
                ("note", .s("frame(x,y) == C001 frame(x+2,y+1); identical audio")),
            ]),
            clip("C009_slow_pan_good.mp4", 10, good + [("motion", .s("slow pan"))], [
                ("pan", .o([("speed_px_per_s", .n(30, 1)), ("total_px", .i(300)), ("direction", .s("camera pans right, image content moves left")),
                            ("quantization", .s("integer-pixel positions (1-2 px per frame)"))])),
            ]),
            clip("C010_mixed.mp4", 20, [("focus", .s("mixed")), ("exposure", .s("mixed")), ("stability", .s("mixed"))], [
                ("segments", .a([.o([("start", .n(0, 2)), ("end", .n(3, 2)), ("label", .s("shaky"))]),
                                 .o([("start", .n(3, 2)), ("end", .n(15, 2)), ("label", .s("good"))]),
                                 .o([("start", .n(15, 2)), ("end", .n(17, 2)), ("label", .s("blurry"))]),
                                 .o([("start", .n(17, 2)), ("end", .n(20, 2)), ("label", .s("dark"))])])),
                ("best_segment", .o([("start", .n(3, 2)), ("end", .n(15, 2))])),
            ]),
            clip("C011_concert_long.mp4", 120, good + [("motion", .s("static camera, slowly cycling coloured light pools"))], [
                ("audio_source", .s("audio/concert_set.wav, 0-120 s")),
                ("audio_segments", .a(c011Segs)),
            ]),
        ])),
    ]), concertDir.appendingPathComponent("clips_truth.json"))

    try writeReadme(segs: segs, iv: iv, b120: b120, b92: b92)
    print("[\(stamp())] generation done")
}

// MARK: - README

func writeReadme(segs: [Segment], iv: InterviewAudio, b120: [Double], b92: [Double]) throws {
    var s = """
    # Cutroom synthetic test media

    Generated by `dev/make-test-media.swift` (deterministic: seeded SplitMix64, no third-party code, no ffmpeg).
    **Dev/test only — not shipped with the panel.**

    Regenerate (compiled is much faster than `swift make-test-media.swift`):

    ```sh
    swiftc -O dev/make-test-media.swift -o /tmp/make-test-media
    /tmp/make-test-media "$PWD/dev/test-media"                # generate + verify
    /tmp/make-test-media "$PWD/dev/test-media" --verify-only  # just re-run the checks
    ```

    ## Formats

    * Video: H.264 High (AVAssetWriter), 1920x1080, 25 fps CFR, keyframe every 25 frames (1 s), ~6 Mbps average
      target (static shots compress far below that), BT.709 tags, `.mp4`.
    * Audio in video: AAC-LC, 48 kHz, stereo, 192 kbps.
    * WAV: PCM 16-bit, 48 kHz, stereo.
    * Synthesized pixels/samples are bit-identical on every run, and WAV/JSON/README files are byte-identical.
      `.mp4` files are not byte-identical between runs (container creation timestamps, Apple's encoders), but
      their decoded content matches the truth files.

    ## Scene

    A 3840x2160 synthetic "stage" rendered once: backdrop gradient, 160 px checkerboard, 2 px grid every 32 px,
    260 random rectangles, 150 random circles/rings, 6 Siemens stars, 4 resolution-bar patches, plank floor,
    lighting truss with 9 coloured beams, 18 bright stage-light blobs, big outlined text labels
    ("MAIN STAGE", "CUTROOM 2026", ...), small text lines, and a dark "wing" in the top-left
    (x < 1500, y < 850 at 25 % brightness, feathered). Footage clips show a 1:1 1920x1080 crop
    (default view at x=1280, y=700) unless noted, so fine detail is native-resolution sharp.

    ## concert/  (10 s, soft crowd-noise audio at -30 dBFS RMS unless noted)

    | File | Duration | What it tests | Ground truth |
    |---|---|---|---|
    | `C001_sharp_static.mp4` | 10 s | steady, sharp, normal exposure (reference "good" clip) | static default view |
    | `C002_blurry.mp4` | 10 s | heavy defocus for the whole clip | 3x box blur r=12 px (~Gaussian sigma 12.5 px) |
    | `C003_dark.mp4` | 10 s | strong underexposure | pixel values x 0.10 |
    | `C004_overexposed.mp4` | 10 s | blown-out highlights (most pixels at/near white) | v' = min(255, 70 + 3.2 v) |
    | `C005_shaky.mp4` | 10 s | handheld shake | per-frame uniform jitter ±25 px, ±0.6° (seeded) |
    | `C006_whip_pan.mp4` | 10 s | whip pan | steady 0–4.0 s, pan +1500 px 4.0–4.6 s (smoothstep, 180° shutter blur), steady 4.6–10 s |
    | `C007_reveal_pullback.mp4` | 10 s | dark-to-bright pull-back "reveal" | zoom 2x→1x and gain 0.15→1.0 over 0–8 s (smoothstep), hold 8–10 s |
    | `C008_duplicate_of_C001.mp4` | 10 s | duplicate detection | C001 content shifted by (2, 1) px; identical audio |
    | `C009_slow_pan_good.mp4` | 10 s | good, smooth slow pan | 30 px/s left-to-right camera pan (300 px total) |
    | `C010_mixed.mp4` | 20 s | in-clip segment selection | 0–3 shaky, 3–15 good, 15–17 blurry, 17–20 dark |
    | `C011_concert_long.mp4` | 120 s | song/applause structure in clip audio | audio = `audio/concert_set.wav` 0–120 s |
    | `clips_truth.json` | – | machine-readable truth for C001–C011 | labels, events, segments |

    `C011_concert_long.mp4` is a static wide shot of the whole stage with slowly cycling coloured light pools.
    Its audio truth is `audio/concert_set_truth.json` restricted to 0–120 s (song 2 is cut at 120.0 s);
    the clipped list is also embedded in `concert/clips_truth.json` (`audio_segments`).

    ## interview/

    | File | Duration | What it tests | Ground truth |
    |---|---|---|---|
    | `I001_interview.mp4` | 90 s | talking head; speech/silence detection, pause trimming | `I001_truth.json` |

    Speech-like audio: band-limited (300–3000 Hz) noise + glottal sawtooth, amplitude-modulated by
    120–300 ms syllables (~4–5 Hz), phrases of 2–8 s, \(iv.phrasesCS.count) phrases total, natural pauses 0.3–0.6 s,
    level -20 dBFS RMS over phrases, speech identical in L/R. Faint pink room noise at -60 dBFS RMS everywhere else.

    Long silences (exact):

    """
    for (a, b) in iv.longSilencesCS { s += "* \(f2(Double(a) / 100)) – \(f2(Double(b) / 100)) s (\(f2(Double(b - a) / 100)) s)\n" }
    s += """

    Leading silence 0.00–\(f2(Double(iv.phrasesCS[0].0) / 100)) s and trailing silence \(f2(Double(iv.phrasesCS.last!.1) / 100))–90.00 s.
    Every phrase start/end and every short pause is listed in `I001_truth.json`.

    ## audio/

    | File | Duration | Content | Ground truth |
    |---|---|---|---|
    | `music_120bpm.wav` | 40 s | 120 BPM, A minor, kick/snare/hat/pad | `music_120bpm_truth.json`: first beat 0.500 s, \(b120.count) beats every 0.5 s |
    | `music_92bpm.wav` | 30 s | 92 BPM, C major, kick/snare/hat/pad | `music_92bpm_truth.json`: first beat 0.250 s, \(b92.count) beats every 0.652174 s |
    | `concert_set.wav` | 291 s | applause / songs / talk / segue | `concert_set_truth.json` |

    Drums: kick = sine sweep 120→50 Hz (tau 40 ms) on every beat, snare on beats 2 & 4, closed hi-hat on every 8th,
    sustained 3-note pad (one chord per bar). Digital silence until 30 ms before the first beat (pad fade-in);
    the first kick lands exactly on the first beat.

    `concert_set.wav` segments (exact boundaries):

    | # | Type | Label | Start (s) | End (s) | Details |
    |---|---|---|---|---|---|

    """
    for (i, g) in segs.enumerated() {
        var det = ""
        if g.type == "song" {
            let d = Dictionary(uniqueKeysWithValues: g.extra.map { ($0.0, $0.1) })
            if case .n(let bpm, _)? = d["bpm"], case .s(let key)? = d["key"] { det = "\(numStr(bpm, 1)) BPM, \(key)" }
            if d["segue_from_previous_song"] != nil { det += ", segue (no gap) from song 3" }
        } else if g.type == "applause" { det = g.extra.isEmpty ? "dense clapping" : "clapping + cheers/whistles, fades out at end" }
        else { det = "speech-like bursts at -26 dBFS RMS with pauses" }
        s += "| \(i + 1) | \(g.type) | \(g.label) | \(f2(g.start, 1)) | \(f2(g.end, 1)) | \(det) |\n"
    }
    s += """

    Levels: songs -14 dBFS RMS (melody + bass + drums + pad), applause -18 dBFS RMS, talk -26 dBFS RMS, plus a
    crowd/room bed at -42 dBFS RMS throughout (the set is never digitally silent). Songs followed by applause fade
    out over their last 1.0 s; applause swells in over ~0.3 s.

    ## Tolerances for tests

    * Energy-based detectors see phrase/segment edges a few tens of ms inside the nominal boundaries
      (syllable envelopes rise/fall smoothly); allow ±0.1 s.
    * The AAC encoder in the `.mp4` files adds priming that AVFoundation/Premiere trim via the edit list; decoded
      audio lines up with the truth within a few ms (the generator's verify step checks this).
    * Video frame i covers [i/25, (i+1)/25) s; segment boundaries in C006/C007/C010 fall on frame boundaries.

    """
    try s.write(to: outRoot.appendingPathComponent("README.md"), atomically: true, encoding: .utf8)
}

// MARK: - Verification

struct LumaFrame { var y: [Float] }
func lumaOf(_ img: CGImage) -> [Float] {
    var buf = [UInt8](repeating: 0, count: OW * OH * 4)
    let cs = (img.colorSpace?.model == .rgb) ? img.colorSpace! : srgb
    buf.withUnsafeMutableBytes { p in
        let ctx = CGContext(data: p.baseAddress, width: OW, height: OH, bitsPerComponent: 8, bytesPerRow: OW * 4, space: cs, bitmapInfo: bgraInfo)!
        ctx.interpolationQuality = .none
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: OW, height: OH))
    }
    var y = [Float](repeating: 0, count: OW * OH)
    for i in 0..<(OW * OH) {
        y[i] = 0.2126 * Float(buf[4 * i + 2]) + 0.7152 * Float(buf[4 * i + 1]) + 0.0722 * Float(buf[4 * i])
    }
    return y
}
struct FStats { var mean: Double; var clip: Double; var sharp: Double }
func frameStats(_ y: [Float]) -> FStats {
    var sum = 0.0, clipN = 0
    for v in y { sum += Double(v); if v >= 250 { clipN += 1 } }
    var ls = 0.0, ls2 = 0.0, n = 0.0
    for r in stride(from: 90, to: OH - 90, by: 1) {
        for c in 160..<(OW - 160) {
            let i = r * OW + c
            let l = Double(4 * y[i] - y[i - 1] - y[i + 1] - y[i - OW] - y[i + OW])
            ls += l; ls2 += l * l; n += 1
        }
    }
    let m = ls / n
    return FStats(mean: sum / Double(y.count), clip: Double(clipN) / Double(y.count), sharp: ls2 / n - m * m)
}
func meanAbsDiff(_ a: [Float], _ b: [Float], dx: Int = 0, dy: Int = 0) -> Double {
    var s = 0.0, n = 0.0
    for r in 60..<(OH - 60) {
        for c in 60..<(OW - 60) { s += Double(abs(a[(r + dy) * OW + c + dx] - b[r * OW + c])); n += 1 }
    }
    return s / n
}
func readAudioTrack(_ url: URL) async throws -> Stereo {
    let asset = AVURLAsset(url: url)
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard let tr = tracks.first else { return Stereo(count: 0) }
    let reader = try AVAssetReader(asset: asset)
    let out = AVAssetReaderTrackOutput(track: tr, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMIsFloatKey: true, AVLinearPCMBitDepthKey: 32,
        AVLinearPCMIsNonInterleaved: false, AVLinearPCMIsBigEndianKey: false, AVSampleRateKey: SR, AVNumberOfChannelsKey: 2,
    ])
    reader.add(out)
    reader.startReading()
    var L: [Float] = [], R: [Float] = []
    while let sb = out.copyNextSampleBuffer() {
        guard let bb = CMSampleBufferGetDataBuffer(sb) else { continue }
        let len = CMBlockBufferGetDataLength(bb)
        var tmp = [Float](repeating: 0, count: len / 4)
        _ = tmp.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(bb, atOffset: 0, dataLength: len, destination: $0.baseAddress!) }
        var i = 0
        while i + 1 < tmp.count { L.append(tmp[i]); R.append(tmp[i + 1]); i += 2 }
    }
    var st = Stereo(count: 0)
    st.L = L; st.R = R
    return st
}
func readWAV(_ url: URL) throws -> (Stereo, Double, Int, Int) {
    let f = try AVAudioFile(forReading: url)
    let fmt = f.processingFormat
    let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(f.length))!
    try f.read(into: buf)
    let n = Int(buf.frameLength)
    var st = Stereo(count: n)
    let ch = Int(fmt.channelCount)
    if let d = buf.floatChannelData {
        for i in 0..<n { st.L[i] = d[0][i]; st.R[i] = d[min(1, ch - 1)][i] }
    }
    let bits = (f.fileFormat.settings[AVLinearPCMBitDepthKey] as? Int) ?? 0
    return (st, f.fileFormat.sampleRate, Int(f.fileFormat.channelCount), bits)
}
func dirSize(_ root: URL) -> Double {
    var total = 0.0
    if let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) {
        for case let u as URL in e { total += Double((try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }
    return total
}
/// Runs of 10 ms windows below thresholdDB lasting at least minDur.
func detectSilences(_ st: Stereo, thresholdDB: Double, minDur: Double) -> [(Double, Double)] {
    let win = 480
    var out: [(Double, Double)] = []
    var runStart = -1
    let nw = st.count / win
    for w in 0...nw {
        var silent = false
        if w < nw {
            silent = ampToDb(st.rms(w * win, (w + 1) * win)) < thresholdDB
        }
        if silent && runStart < 0 { runStart = w }
        if !silent && runStart >= 0 {
            let a = Double(runStart * win) / SRd, b = Double(w * win) / SRd
            if b - a >= minDur { out.append((a, b)) }
            runStart = -1
        }
    }
    return out
}

func verifyAll() async throws {
    print("\n================ VERIFICATION ================")
    var failures: [String] = []
    func check(_ ok: Bool, _ what: String) { print("   [\(ok ? "PASS" : "FAIL")] \(what)"); if !ok { failures.append(what) } }
    var rows: [[String]] = []
    let fm = FileManager.default
    func sizeMB(_ u: URL) -> Double { Double((try? fm.attributesOfItem(atPath: u.path)[.size] as? Int) ?? 0) / 1_048_576 }

    struct VSpec { let rel: String; let dur: Double; let probes: [Int] }
    let vids: [VSpec] = [
        VSpec(rel: "concert/C001_sharp_static.mp4", dur: 10, probes: [50, 125, 200]),
        VSpec(rel: "concert/C002_blurry.mp4", dur: 10, probes: [125]),
        VSpec(rel: "concert/C003_dark.mp4", dur: 10, probes: [125]),
        VSpec(rel: "concert/C004_overexposed.mp4", dur: 10, probes: [125]),
        VSpec(rel: "concert/C005_shaky.mp4", dur: 10, probes: [50, 150]),
        VSpec(rel: "concert/C006_whip_pan.mp4", dur: 10, probes: [50, 107, 200]),
        VSpec(rel: "concert/C007_reveal_pullback.mp4", dur: 10, probes: [0, 100, 225]),
        VSpec(rel: "concert/C008_duplicate_of_C001.mp4", dur: 10, probes: [125]),
        VSpec(rel: "concert/C009_slow_pan_good.mp4", dur: 10, probes: [125]),
        VSpec(rel: "concert/C010_mixed.mp4", dur: 20, probes: [37, 225, 400, 462]),
        VSpec(rel: "concert/C011_concert_long.mp4", dur: 120, probes: [100, 1500]),
        VSpec(rel: "interview/I001_interview.mp4", dur: 90, probes: [300]),
    ]
    var stats: [String: [Int: (FStats, Double)]] = [:]
    var lumaC001: [Float] = [], lumaC008: [Float] = []
    for v in vids {
        let url = outRoot.appendingPathComponent(v.rel)
        print("\n-- \(v.rel)")
        guard fm.fileExists(atPath: url.path) else { check(false, "\(v.rel) exists"); continue }
        let asset = AVURLAsset(url: url)
        let dur = try await asset.load(.duration).seconds
        let vt = try await asset.loadTracks(withMediaType: .video)
        let at = try await asset.loadTracks(withMediaType: .audio)
        guard let v0 = vt.first else { check(false, "\(v.rel) has video"); continue }
        let size = try await v0.load(.naturalSize)
        let fps = try await v0.load(.nominalFrameRate)
        let rate = try await v0.load(.estimatedDataRate)
        let vfd = try await v0.load(.formatDescriptions)
        let codec = vfd.first.map { CMFormatDescriptionGetMediaSubType($0) } ?? 0
        let codecStr = String(bytes: [24, 16, 8, 0].map { UInt8((codec >> $0) & 0xFF) }, encoding: .ascii) ?? "?"
        var aDesc = "none"
        var aDur = 0.0
        if let a0 = at.first {
            let afd = try await a0.load(.formatDescriptions)
            aDur = try await a0.load(.timeRange).duration.seconds
            if let d = afd.first, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(d)?.pointee {
                aDesc = "\(asbd.mFormatID == kAudioFormatMPEG4AAC ? "AAC" : "fmt\(asbd.mFormatID)") \(Int(asbd.mSampleRate)) Hz \(asbd.mChannelsPerFrame)ch"
            }
        }
        print("   duration \(f2(dur, 3)) s, \(Int(size.width))x\(Int(size.height)), \(f2(Double(fps), 2)) fps, \(codecStr), video \(f2(Double(rate) / 1e6, 2)) Mbps, tracks v=\(vt.count) a=\(at.count) (\(aDesc), audio dur \(f2(aDur, 3)) s)")
        check(abs(dur - v.dur) < 0.05, "\(v.rel) duration \(f2(dur, 3)) ≈ \(v.dur)")
        check(Int(size.width) == OW && Int(size.height) == OH && abs(Double(fps) - 25) < 0.01 && codecStr == "avc1", "\(v.rel) 1920x1080 25fps H.264")
        check(vt.count == 1 && at.count == 1 && aDesc.hasPrefix("AAC 48000 Hz 2ch") && abs(aDur - v.dur) < 0.05, "\(v.rel) 1 video + 1 AAC 48k stereo track")
        rows.append([v.rel, f2(dur, 2), "\(Int(size.width))x\(Int(size.height))@\(f2(Double(fps), 0))", "\(vt.count)v+\(at.count)a", aDesc, f2(Double(rate) / 1e6, 2), f2(sizeMB(url), 2)])

        let gen = AVAssetImageGenerator(asset: asset)
        gen.requestedTimeToleranceBefore = .zero
        gen.requestedTimeToleranceAfter = .zero
        gen.appliesPreferredTrackTransform = true
        var st: [Int: (FStats, Double)] = [:]
        for f in v.probes {
            let img = try await gen.image(at: CMTime(value: CMTimeValue(2 * f + 1), timescale: CMTimeScale(2 * FPS))).image
            let img2 = try await gen.image(at: CMTime(value: CMTimeValue(2 * f + 3), timescale: CMTimeScale(2 * FPS))).image
            let y = lumaOf(img), y2 = lumaOf(img2)
            let s = frameStats(y)
            let mo = meanAbsDiff(y2, y)
            st[f] = (s, mo)
            print("   frame \(String(format: "%4d", f)) (t=\(f2(Double(f) / 25, 2))s): mean luma \(f2(s.mean, 1)), clipped≥250 \(f2(100 * s.clip, 1))%, sharpness(var Laplacian) \(f2(s.sharp, 1)), |Δ next frame| \(f2(mo, 2))")
            if v.rel.contains("/C001_") && f == 125 { lumaC001 = y }
            if v.rel.contains("/C008_") && f == 125 { lumaC008 = y }
        }
        stats[v.rel] = st
    }
    // Content checks
    print("\n-- content checks")
    func S(_ k: String, _ f: Int) -> (FStats, Double)? { stats.first(where: { $0.key.contains("/\(k)_") })?.value[f] }
    if let g = S("C001", 125) {
        check(g.0.mean > 90 && g.0.mean < 150, "C001 mean luma mid (\(f2(g.0.mean, 1)))")
        check(g.1 < 1.0, "C001 static (|Δ| \(f2(g.1, 2)))")
        if let b = S("C002", 125) { check(b.0.sharp < 0.05 * g.0.sharp, "C002 sharpness \(f2(b.0.sharp, 1)) << C001 \(f2(g.0.sharp, 1))") }
        if let d = S("C003", 125) { check(d.0.mean < 0.2 * g.0.mean, "C003 mean luma \(f2(d.0.mean, 1)) ≈ 10% of C001") }
        if let o = S("C004", 125) { check(o.0.clip > 0.6, "C004 \(f2(100 * o.0.clip, 1))% pixels clipped") }
        if let s = S("C005", 50) { check(s.1 > 5, "C005 frame-to-frame motion \(f2(s.1, 2))") }
        if let a = S("C006", 50), let p = S("C006", 107), let c = S("C006", 200) {
            check(a.1 < 1 && c.1 < 1 && p.1 > 10, "C006 steady before/after (\(f2(a.1, 2)), \(f2(c.1, 2))), moving at 4.28 s (\(f2(p.1, 2)))")
            check(p.0.sharp < 0.6 * a.0.sharp, "C006 motion-blurred during pan (sharpness \(f2(p.0.sharp, 1)) vs \(f2(a.0.sharp, 1)))")
        }
        if let a = S("C007", 0), let c = S("C007", 225) { check(a.0.mean < 15 && c.0.mean > 60, "C007 dark start (\(f2(a.0.mean, 1))) -> normal end (\(f2(c.0.mean, 1)))") }
        if let p = S("C009", 125) { check(p.1 > 0.5 && p.0.sharp > 0.5 * g.0.sharp, "C009 slow motion (|Δ| \(f2(p.1, 2))) and sharp") }
        if let a = S("C010", 37), let b = S("C010", 225), let c = S("C010", 400), let d = S("C010", 462) {
            check(a.1 > 5 && b.1 < 1 && c.0.sharp < 0.05 * g.0.sharp && d.0.mean < 0.2 * g.0.mean, "C010 segments shaky/good/blurry/dark")
        }
    }
    if !lumaC001.isEmpty && !lumaC008.isEmpty {
        let raw = meanAbsDiff(lumaC001, lumaC008), aligned = meanAbsDiff(lumaC001, lumaC008, dx: 2, dy: 1)
        check(aligned < 2.5, "C008 == C001 shifted (2,1): aligned |Δ| \(f2(aligned, 2)) (unaligned \(f2(raw, 2)))")
    }

    // Interview audio: decoded AAC vs truth.
    print("\n-- interview audio (decoded from mp4)")
    let ivA = try await readAudioTrack(interviewDir.appendingPathComponent("I001_interview.mp4"))
    let truthSil = [(10.0, 12.5), (31.0, 33.0), (50.0, 54.0), (70.0, 71.5)]
    let det = detectSilences(ivA, thresholdDB: -45, minDur: 1.0)
    print("   decoded \(f2(Double(ivA.count) / SRd, 3)) s; silences ≥1.0 s below -45 dBFS: " + det.map { "\(f2($0.0, 2))–\(f2($0.1, 2))" }.joined(separator: ", "))
    check(det.count == truthSil.count && zip(det, truthSil).allSatisfy { abs($0.0 - $1.0) < 0.1 && abs($0.1 - $1.1) < 0.1 },
          "I001 detected long silences match truth within 0.1 s")
    let silRMS = ampToDb(ivA.rms(Int(50.5 * SRd), Int(53.5 * SRd)))
    print("   room noise level in 50.5–53.5 s: \(f2(silRMS, 1)) dBFS")
    check(silRMS < -55 && silRMS > -66, "I001 long-silence floor ≈ -60 dBFS")

    // C011 audio vs concert segments.
    print("\n-- C011 audio (decoded from mp4)")
    let cA = try await readAudioTrack(concertDir.appendingPathComponent("C011_concert_long.mp4"))
    for (a, b, lab) in [(0.5, 14.0, "applause"), (16.0, 73.0, "song 1"), (75.5, 82.0, "applause"), (83.5, 94.5, "talk"), (96.0, 119.0, "song 2")] {
        print("   \(lab) \(f2(a, 1))–\(f2(b, 1)) s: \(f2(ampToDb(cA.rms(Int(a * SRd), Int(b * SRd))), 1)) dBFS RMS")
    }

    // WAV files.
    print("\n-- WAV files")
    struct WSpec { let rel: String; let dur: Double; let bpm: Double; let first: Double }
    for w in [WSpec(rel: "audio/music_120bpm.wav", dur: 40, bpm: 120, first: 0.5), WSpec(rel: "audio/music_92bpm.wav", dur: 30, bpm: 92, first: 0.25),
              WSpec(rel: "audio/concert_set.wav", dur: 291, bpm: 0, first: 0)] {
        let url = outRoot.appendingPathComponent(w.rel)
        let (st, sr, ch, bits) = try readWAV(url)
        let dur = Double(st.count) / sr
        print("   \(w.rel): \(f2(dur, 3)) s, \(Int(sr)) Hz, \(ch) ch, \(bits)-bit, peak \(f2(ampToDb(st.peak()), 1)) dBFS, RMS \(f2(ampToDb(st.rms()), 1)) dBFS")
        check(abs(dur - w.dur) < 0.001 && Int(sr) == SR && ch == 2 && bits == 16, "\(w.rel) 48 kHz 16-bit stereo \(w.dur) s")
        rows.append([w.rel, f2(dur, 2), "-", "audio", "PCM \(Int(sr)) Hz \(ch)ch \(bits)-bit", "-", f2(sizeMB(url), 2)])
        if w.bpm > 0 {
            var ratios: [Double] = []
            var t = w.first
            while t < w.dur - 0.05 {
                let i = Int((t * SRd).rounded())
                let post = st.rms(i, i + Int(0.03 * SRd)), pre = st.rms(i - Int(0.06 * SRd), i - Int(0.01 * SRd))
                ratios.append(ampToDb(post / max(pre, 1e-9)))
                t += 60 / w.bpm
            }
            let sorted = ratios.sorted()
            print("   onset jump at truth beats: min \(f2(sorted.first ?? 0, 1)) dB, median \(f2(sorted[sorted.count / 2], 1)) dB over \(ratios.count) beats")
            // Shifting the grid by half a beat must look clearly worse.
            check((sorted.first ?? 0) > 6, "\(w.rel) every truth beat has a >6 dB onset")
        } else {
            let segData = try String(contentsOf: audioDir.appendingPathComponent("concert_set_truth.json"), encoding: .utf8)
            print("   (segment levels)")
            let probes: [(Double, Double, String)] = [(0.5, 14, "applause"), (16, 73, "song1"), (75.5, 82, "applause"), (83.5, 94.5, "talk"),
                                                       (96, 168, "song2"), (170.5, 175.5, "applause"), (177, 225.5, "song3"),
                                                       (226.5, 269.5, "song4"), (271.5, 288, "applause+cheers")]
            for (a, b, l) in probes { print("     \(l.padding(toLength: 16, withPad: " ", startingAt: 0)) \(f2(a, 1))–\(f2(b, 1)) s: \(f2(ampToDb(st.rms(Int(a * SRd), Int(b * SRd))), 1)) dBFS") }
            check(segData.contains("\"segments\""), "concert_set_truth.json present")
        }
    }
    for j in ["audio/music_120bpm_truth.json", "audio/music_92bpm_truth.json", "audio/concert_set_truth.json", "interview/I001_truth.json", "concert/clips_truth.json"] {
        let u = outRoot.appendingPathComponent(j)
        let ok = (try? JSONSerialization.jsonObject(with: Data(contentsOf: u))) != nil
        check(ok, "\(j) parses as JSON")
        rows.append([j, "-", "-", "json", "-", "-", f2(sizeMB(u) * 1024, 1) + " KB"])
    }

    // Summary table
    print("\n================ SUMMARY ================")
    let hdr = ["File", "Dur(s)", "Video", "Tracks", "Audio", "V Mbps", "Size MB"]
    var widths = hdr.map { $0.count }
    for r in rows { for (k, c) in r.enumerated() { widths[k] = max(widths[k], c.count) } }
    func line(_ r: [String]) -> String { r.enumerated().map { $0.1.padding(toLength: widths[$0.0], withPad: " ", startingAt: 0) }.joined(separator: " | ") }
    print(line(hdr))
    print(widths.map { String(repeating: "-", count: $0) }.joined(separator: "-+-"))
    for r in rows { print(line(r)) }
    let total = dirSize(outRoot)
    print("Total size of \(outRoot.lastPathComponent)/: \(f2(total / 1_048_576, 1)) MB")
    print(failures.isEmpty ? "\nALL CHECKS PASSED" : "\n\(failures.count) CHECK(S) FAILED:\n - " + failures.joined(separator: "\n - "))
}

// MARK: - Main

print("Cutroom test media -> \(outRoot.path)")
if !verifyOnly {
    do { try generateAll() } catch { print("GENERATION FAILED: \(error)"); exit(1) }
}
if !skipVerify {
    let sem = DispatchSemaphore(value: 0)
    Task.detached {
        do { try await verifyAll() } catch { print("VERIFICATION ERROR: \(error)") }
        sem.signal()
    }
    sem.wait()
}
