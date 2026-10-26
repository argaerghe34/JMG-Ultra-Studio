// Can a detached <video> play fast and deliver frames via requestVideoFrameCallback inside CEP?
const file = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/VID-20261015-WA0022.mp4';
const v = document.createElement('video');
v.muted = true; v.preload = 'auto';
v.src = US.vision.fileUrl(file);
await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; });
const results = {};
for (const rate of [4, 8, 16]) {
  v.currentTime = 0; await new Promise(r => v.onseeked = r);
  v.playbackRate = rate;
  const times = []; let grabs = 0;
  const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
  let stop = false;
  const cb = (now, meta) => { times.push(meta.mediaTime); g.drawImage(v, 0, 0, 160, 90); g.getImageData(0, 0, 160, 90); grabs++; if (!stop) v.requestVideoFrameCallback(cb); };
  v.requestVideoFrameCallback(cb);
  const t0 = performance.now();
  await v.play();
  await new Promise(r => setTimeout(r, 3000));
  stop = true; v.pause();
  const wall = (performance.now() - t0) / 1000;
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  results['x' + rate] = { mediaCovered: +(times[times.length - 1] - times[0]).toFixed(2), wall: +wall.toFixed(2), speed: +((times[times.length - 1] - times[0]) / wall).toFixed(1), frames: times.length, medGap: +US.median(gaps).toFixed(3), maxGap: +Math.max(...gaps).toFixed(3) };
}
v.removeAttribute('src'); v.load();
return results;
