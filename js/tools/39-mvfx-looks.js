/* JMG Ultra Studio – mVFX › the five looks: a colour transform each (our own maths), written as a .cube 3D LUT for
   Resolve (put on the clip's first node with SetLUT) and for Lumetri's Input LUT, and the Lumetri settings that
   come closest in Premiere (set straight on a Lumetri Color effect). Pure – unit-tested. */
(function () {
  'use strict';
  const US = window.US;
  const clamp = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mix = (a, b, k) => a + (b - a) * k;
  /** Each look: f([r,g,b]) -> [r,g,b] in 0..1, and the Lumetri settings that come closest. */
  const LOOKS = {
    faded: {
      label: 'Faded memory',
      f: ([r, g, b]) => { const lift = 0.09, k = 0.82; const y = lum(r, g, b); return [clamp(lift + mix(y, r, 0.75) * k + 0.02), clamp(lift + mix(y, g, 0.75) * k + 0.01), clamp(lift + mix(y, b, 0.75) * k)]; },
      lumetri: { Contrast: -18, Blacks: 22, Highlights: -10, Saturation: 78, 'Faded Film': 45, Temperature: 6 }
    },
    warm: {
      label: 'Warm archive',
      f: ([r, g, b]) => { const y = lum(r, g, b); r = mix(y, r, 0.85); g = mix(y, g, 0.85); b = mix(y, b, 0.85); return [clamp(Math.pow(r, 0.92) * 1.04), clamp(Math.pow(g, 0.96) * 0.99), clamp(Math.pow(b, 1.08) * 0.9 + 0.01)]; },
      lumetri: { Temperature: 28, Tint: 6, Contrast: 6, Saturation: 86, 'Faded Film': 12, Shadows: 4 }
    },
    cold: {
      label: 'Cold night',
      f: ([r, g, b]) => { const y = lum(r, g, b), s = 1 - y; return [clamp(r * 0.92 - 0.02 * s), clamp(g * 0.97), clamp(b * 1.04 + 0.08 * s)]; },
      lumetri: { Temperature: -26, Tint: -4, Contrast: 10, Saturation: 92, Shadows: -6 }
    },
    bleach: {
      label: 'Bleach',
      f: ([r, g, b]) => { const y = lum(r, g, b), c = v => clamp((v - 0.5) * 1.35 + 0.5); return [c(mix(y, r, 0.45)), c(mix(y, g, 0.45)), c(mix(y, b, 0.45))]; },
      lumetri: { Contrast: 38, Saturation: 48, Highlights: 12, Blacks: -8, Whites: 6 }
    },
    sepia: {
      label: 'Sepia',
      f: ([r, g, b]) => { const y = lum(r, g, b); return [clamp(y * 1.07 + 0.03), clamp(y * 0.93 + 0.02), clamp(y * 0.74)]; },
      lumetri: { Saturation: 0, Temperature: 40, Tint: 10, Contrast: 8, 'Faded Film': 20 }
    },
    bw: {
      label: 'Black & white',
      f: ([r, g, b]) => { const y = clamp((lum(r, g, b) - 0.5) * 1.1 + 0.5); return [y, y, y]; },
      lumetri: { Saturation: 0, Contrast: 12 }
    }
  };
  /** A .cube file (3D, n per side) of a look – text, ready to write. */
  function cube(id, n = 17) {
    const look = LOOKS[id]; if (!look) throw new Error('No look ' + id);
    const lines = [`TITLE "JMG Ultra Studio – ${look.label}"`, `LUT_3D_SIZE ${n}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const o = look.f([r / (n - 1), g / (n - 1), b / (n - 1)]);
      lines.push(o.map(x => x.toFixed(5)).join(' '));
    }
    return lines.join('\n') + '\n';
  }
  /** A quick preview of a look on canvas pixels (ImageData), for the thumbnails. */
  function applyToImageData(id, data) {
    const f = LOOKS[id].f;
    for (let i = 0; i < data.length; i += 4) { const o = f([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]); data[i] = o[0] * 255; data[i + 1] = o[1] * 255; data[i + 2] = o[2] * 255; }
    return data;
  }
  const fileName = id => `JMG ${LOOKS[id].label}.cube`;
  US.mvfxLooks = { LOOKS, cube, applyToImageData, fileName };
})();
