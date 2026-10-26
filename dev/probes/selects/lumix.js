// Does the panel really decode the Lumix 10-bit 4:2:2 H.264 MOV? Grab frames and look at them.
const file = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/dev/test-media/real/P1003525.MOV';
const v = document.createElement('video'); v.muted = true; v.preload = 'auto';
v.src = US.vision.fileUrl(file);
const t0 = performance.now();
const loaded = await new Promise(r => { v.onloadeddata = () => r('loadeddata'); v.onerror = () => r('error ' + (v.error && v.error.code) + ' ' + (v.error && v.error.message)); setTimeout(() => r('timeout'), 8000); });
const out = { loaded, ms: Math.round(performance.now() - t0), w: v.videoWidth, h: v.videoHeight, dur: v.duration, canPlay: v.canPlayType('video/quicktime; codecs="avc1.7A0033"') };
const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d', { willReadFrequently: true });
out.frames = [];
for (const t of [1, 5, 10, 20]) {
  const s = performance.now();
  const ok = await new Promise(r => { v.onseeked = () => r(true); v.onerror = () => r(false); v.currentTime = t; setTimeout(() => r('timeout'), 6000); });
  g.drawImage(v, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data;
  let sum = 0, sum2 = 0, n = d.length / 4; for (let k = 0; k < d.length; k += 4) { const y = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]; sum += y; sum2 += y * y; }
  const m = sum / n; out.frames.push({ t, ok, ms: Math.round(performance.now() - s), mean: +m.toFixed(1), sd: +Math.sqrt(sum2 / n - m * m).toFixed(1), vt: +v.currentTime.toFixed(2), q: v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames : null });
}
v.removeAttribute('src'); v.load();
return out;
