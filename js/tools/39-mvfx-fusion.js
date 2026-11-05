/* JMG Ultra Studio – mVFX › Resolve templates. Every preset of the Documentary pack becomes a Fusion template file
   (.setting – the text format Resolve's own Edit-page titles and generators use): titles from the preset's layers
   (Text+ for the words, Background + Rectangle masks for rules and bars, a Merge per layer, in/out animation on
   splines through a KeyStretcher so it follows the clip's length), and generators for the overlays, backgrounds and
   freeze-frame looks (FastNoise, Background, Ellipse/Rectangle masks). The words, colours, sizes and positions are
   exposed as Inspector controls. Pure text building – unit-tested; Resolve itself is tested end to end. */
(function () {
  'use strict';
  const US = window.US;
  const TAG = 'JMG';                       // template names: "JMG Hairline", so they sit together in the Effects Library
  const SRC_END = 150;                     // the animation is authored over 150 frames and stretched to the clip
  const FPS = 25;

  /* ---------- Lua-table writing ---------- */
  const str = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"';
  const num = n => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '0');
  /** One Input { … } from a plain value or a {src, out} link, {expr}, {fuid}, {x, y} point. */
  function input(v) {
    if (v && typeof v === 'object') {
      if (v.src) return `Input { SourceOp = ${str(v.src)}, Source = ${str(v.out || 'Output')}, }`;
      if (v.expr != null) return `Input { Expression = ${str(v.expr)}, }`;
      if (v.fuid != null) return `Input { Value = FuID { ${str(v.fuid)} }, }`;
      if (v.x != null) return `Input { Value = { ${num(v.x)}, ${num(v.y)} }, }`;
    }
    if (typeof v === 'string') return `Input { Value = ${str(v)}, }`;
    return `Input { Value = ${num(v)}, }`;
  }
  /** A tool: name = Type { Inputs = { k = Input…, }, ViewInfo = OperatorInfo { Pos = {x, y} } } */
  function tool(name, type, inputs, pos, extra = '') {
    const lines = Object.entries(inputs).filter(([, v]) => v !== undefined).map(([k, v]) => `\t\t\t\t\t\t${/^[A-Za-z_]\w*$/.test(k) ? k : '["' + k + '"]'} = ${input(v)},`);
    return `\t\t\t\t${name} = ${type} {\n\t\t\t\t\tInputs = {\n${lines.join('\n')}\n\t\t\t\t\t},${extra}\n\t\t\t\t\tViewInfo = OperatorInfo { Pos = { ${num(pos[0])}, ${num(pos[1])} } },\n\t\t\t\t},`;
  }
  /** A BezierSpline from [{f, v}] keys (smooth, eased handles). */
  function spline(name, keys) {
    const ks = keys.map((k, i) => {
      const prev = keys[i - 1], next = keys[i + 1], parts = [num(k.v)];
      if (prev) parts.push(`LH = { ${num(k.f - (k.f - prev.f) / 3)}, ${num(k.v)} }`);
      if (next) parts.push(`RH = { ${num(k.f + (next.f - k.f) / 3)}, ${num(k.v)} }`);
      return `\t\t\t\t\t\t[${num(k.f)}] = { ${parts.join(', ')} },`;
    });
    return `\t\t\t\t${name} = BezierSpline {\n\t\t\t\t\tSplineColor = { Red = 201, Green = 169, Blue = 106 },\n\t\t\t\t\tKeyFrames = {\n${ks.join('\n')}\n\t\t\t\t\t}\n\t\t\t\t},`;
  }
  /** An exposed control: Inputs = ordered() { … } entry. */
  function expose(id, src, source, name, extra = {}) {
    const more = Object.entries(extra).map(([k, v]) => `, ${k} = ${typeof v === 'string' ? str(v) : num(v)}`).join('');
    return `\t\t\t\t${id} = InstanceInput { SourceOp = ${str(src)}, Source = ${str(source)}${name ? ', Name = ' + str(name) : ''}${more}, },`;
  }
  /** The whole file round a group of tools. */
  function wrapGroup(name, tools, exposed, outputOp, outSource = 'Output') {
    return `{\n\tTools = ordered() {\n\t\t${name} = GroupOperator {\n\t\t\tCtrlWZoom = false,\n\t\t\tNameSet = true,\n\t\t\tInputs = ordered() {\n${exposed.join('\n')}\n\t\t\t},\n\t\t\tOutputs = {\n\t\t\t\tMainOutput1 = InstanceOutput { SourceOp = ${str(outputOp)}, Source = ${str(outSource)}, }\n\t\t\t},\n\t\t\tViewInfo = GroupInfo { Pos = { 0, 0 }, Flags = { AllowPan = false, AutoSnap = true, RemoveRouters = true }, Size = { 400, 300, 200, 24 }, Direction = "Horizontal", PipeStyle = "Direct", Scale = 1, Offset = { 0, 0 } },\n\t\t\tTools = ordered() {\n${tools.join('\n')}\n\t\t\t},\n\t\t},\n\t},\n\tActiveTool = ${str(name)}\n}\n`;
  }
  const rgb = hex => { const [r, g, b] = US.mvfxPack.hexToRgb(hex); return [r / 255, g / 255, b / 255]; };
  const opName = s => TAG + '_' + String(s).replace(/[^A-Za-z0-9]+/g, '_');
  const templateName = preset => `${TAG} ${preset.label.replace(/[·\/\\:?*<>|"]+/g, '-').replace(/\s+/g, ' ').trim()}`;
  const frame = (W, H) => ({ Width: W, Height: H, UseFrameFormatSettings: 1, Depth: 1 });

  /* ---------- titles ---------- */
  /**
   * A title template for a preset with layers. values: the pack's values (text, colours, fonts, scale). size: {width, height}.
   * -> {name, body, inputs: {op: {input: value}}} – inputs are what to set again after inserting (the same values).
   */
  function title(preset, values, size = {}) {
    const P = US.mvfxPack, W = size.width || 1920, H = size.height || 1080, v = values || P.defaults(preset);
    const inF = Math.round((preset.inSec || 0.6) * FPS), outF = Math.round((preset.outSec || 0.5) * FPS);
    const tools = [], exposed = [], inputs = {}, S = v.scale || 1, dx = v.dx || 0, dy = v.dy || 0;
    tools.push(tool('Base', 'Background', Object.assign(frame(W, H), { TopLeftRed: 0, TopLeftGreen: 0, TopLeftBlue: 0, TopLeftAlpha: 0 }), [0, 0]));
    let prev = 'Base', n = 0, ctrl = 0;
    (preset.layers || []).forEach((L, i) => {
      const id = ++n, delay = Math.round(i * 0.08 * FPS), a0 = delay, a1 = Math.min(SRC_END - outF - 2, delay + inF);
      const fade = [{ f: a0, v: 0 }, { f: a1, v: 1 }, { f: SRC_END - outF, v: 1 }, { f: SRC_END, v: 0 }];
      let fg;
      if (L.type === 'rect') {
        const col = rgb((v.colours || P.DOC)[L.colour] || P.DOC[L.colour]), w = L.w * (L.fit ? 1 : S), h = L.h * (L.h < 0.01 ? 1 : S);
        const cx = L.x + dx + w / 2, cy = 1 - (L.y + dy + h / 2);
        const grow = L.anim === 'grow', growY = L.anim === 'growY';
        const mask = { Center: grow ? { expr: `Point(${num(L.x + dx)} + Width/2, ${num(cy)})` } : growY ? { expr: `Point(${num(cx)}, ${num(1 - (L.y + dy))} - Height/2)` } : { x: cx, y: cy }, Width: grow ? { src: `R${id}Grow`, out: 'Value' } : w, Height: growY ? { src: `R${id}Grow`, out: 'Value' } : h, SoftEdge: 0 };
        tools.push(tool(`R${id}M`, 'RectangleMask', mask, [id * 150, 150]));
        if (grow || growY) tools.push(spline(`R${id}Grow`, [{ f: a0, v: 0 }, { f: a1, v: grow ? w : h }]));
        tools.push(tool(`R${id}`, 'Background', Object.assign(frame(W, H), { TopLeftRed: col[0], TopLeftGreen: col[1], TopLeftBlue: col[2], TopLeftAlpha: L.alpha != null ? L.alpha : 1, EffectMask: { src: `R${id}M`, out: 'Mask' } }), [id * 150, 100]));
        exposed.push(expose(`C${++ctrl}`, `R${id}`, 'TopLeftRed', `${L.colour === 'ink' ? 'Bar' : 'Line'} ${id} colour`, { ControlGroup: ctrl }), expose(`C${++ctrl}`, `R${id}`, 'TopLeftGreen', '', { ControlGroup: ctrl - 1 }), expose(`C${++ctrl}`, `R${id}`, 'TopLeftBlue', '', { ControlGroup: ctrl - 2 }));
        fg = `R${id}`;
      } else {
        const col = rgb((v.colours || P.DOC)[L.colour] || P.DOC[L.colour]), words = P.wordsOf(L, v), fam = P.fontFor(L, v);
        const x = L.x + dx, y = 1 - (L.y + dy);
        const t = Object.assign(frame(W, H), {
          StyledText: words, Font: fam, Style: L.bold ? 'Bold' : 'Regular', Size: L.size * S * 1.0,
          Center: { x, y }, HorizontalLeftCenterRight: L.align === 'centre' ? 0 : L.align === 'right' ? 1 : -1, HorizontalJustificationNew: 3,
          VerticalTopCenterBottom: 0, VerticalJustificationNew: 3, Red1: col[0], Green1: col[1], Blue1: col[2],
          CharacterSpacing: 1 + (L.tracking || 0) * 2, LineSpacing: L.lineHeight ? L.lineHeight / 1.25 : 1,
          LayoutSize: L.maxWidth ? 1 : undefined, LayoutType: L.maxWidth ? 1 : undefined, LayoutWidth: L.maxWidth ? L.maxWidth : undefined
        });
        tools.push(tool(`T${id}`, 'TextPlus', t, [id * 150, 100]));
        inputs[`T${id}`] = { StyledText: words, Font: fam, Red1: col[0], Green1: col[1], Blue1: col[2] };
        const label = (preset.fields || []).find(f => f.id === L.field), nm = label ? label.label : L.fixed ? 'Mark' : L.field;
        exposed.push(expose(`C${++ctrl}`, `T${id}`, 'StyledText', nm), expose(`C${++ctrl}`, `T${id}`, 'Font', `${nm} font`), expose(`C${++ctrl}`, `T${id}`, 'Size', `${nm} size`));
        exposed.push(expose(`C${++ctrl}`, `T${id}`, 'Red1', `${nm} colour`, { ControlGroup: ctrl }), expose(`C${++ctrl}`, `T${id}`, 'Green1', '', { ControlGroup: ctrl - 1 }), expose(`C${++ctrl}`, `T${id}`, 'Blue1', '', { ControlGroup: ctrl - 2 }));
        exposed.push(expose(`C${++ctrl}`, `T${id}`, 'Center', `${nm} position`));
        fg = `T${id}`;
        if (L.anim === 'rise' || L.anim === 'slide') {
          const mx = L.anim === 'slide' ? -0.04 : 0, my = L.anim === 'rise' ? -0.035 : 0;
          tools.push(tool(`X${id}`, 'Transform', { Input: { src: `T${id}` }, Center: { expr: `Point(0.5 + ${num(mx)} * (1 - M${id}.Blend), 0.5 + ${num(my)} * (1 - M${id}.Blend))` } }, [id * 150, 150]));
          fg = `X${id}`;
        }
      }
      tools.push(spline(`M${id}Blend`, fade));
      tools.push(tool(`M${id}`, 'Merge', { Background: { src: prev }, Foreground: { src: fg }, Blend: { src: `M${id}Blend`, out: 'Value' }, PerformDepthMerge: 0 }, [id * 150, 200]));
      prev = `M${id}`;
    });
    tools.push(tool('Overall', 'Transform', { Input: { src: prev } }, [n * 150 + 150, 200]));
    exposed.unshift(expose('C0', 'Overall', 'Center', 'Overall position'), expose('C00', 'Overall', 'Size', 'Overall size'));
    tools.push(tool('KS', 'KeyStretcher', { Keyframes: { src: 'Overall' }, SourceEnd: SRC_END, StretchStart: inF + Math.round(0.08 * FPS * ((preset.layers || []).length - 1)) + 1, StretchEnd: SRC_END - outF - 1 }, [n * 150 + 300, 200]));
    const name = templateName(preset);
    return { name, body: wrapGroup(opName(preset.label), tools, exposed, 'KS', 'Result'), inputs, kind: 'titles' };
  }

  /* ---------- generators: overlays, backgrounds, freeze looks ---------- */
  const noise = (name, W, H, o, pos) => tool(name, 'FastNoise', Object.assign(frame(W, H), { Detail: 5, Contrast: 1, Brightness: 0, XScale: 10, YScale: 10, Seethe: 0, SeetheRate: 0, Color1Red: 0, Color1Green: 0, Color1Blue: 0, Color1Alpha: 0, Color2Red: 1, Color2Green: 1, Color2Blue: 1, Color2Alpha: 1 }, o), pos);
  const solid = (name, W, H, hex, alpha, extra, pos) => { const c = rgb(hex); return tool(name, 'Background', Object.assign(frame(W, H), { TopLeftRed: c[0], TopLeftGreen: c[1], TopLeftBlue: c[2], TopLeftAlpha: alpha == null ? 1 : alpha }, extra || {}), pos); };
  const merge = (name, bg, fg, extra, pos) => tool(name, 'Merge', Object.assign({ Background: { src: bg }, Foreground: { src: fg }, PerformDepthMerge: 0 }, extra || {}), pos);
  /**
   * A generator template for an overlay, background or freeze-frame look. values.alpha: strength; values.cx/cy: the
   * spotlight's place. -> {name, body, inputs, kind: 'generators', blend}
   */
  function generator(preset, values, size = {}) {
    const P = US.mvfxPack, W = size.width || 1920, H = size.height || 1080, v = values || {}, a = v.alpha != null ? v.alpha : (preset.alpha != null ? preset.alpha : 1);
    const accent = (v.colours || P.DOC).accent || P.DOC.accent, tools = [], exposed = [];
    let out = 'Out', k = preset.paint || (preset.look === 'bw' ? 'bw' : '');
    const vignette = (name, strength, inner, pos, center) => {
      tools.push(tool(name + 'M', 'EllipseMask', { Center: center || { x: 0.5, y: 0.5 }, Width: 1.25 - inner * 0.5, Height: 1.25 - inner * 0.5, SoftEdge: 0.45, Invert: 1 }, [pos[0], pos[1] + 50]));
      tools.push(solid(name, W, H, '#000000', strength, { EffectMask: { src: name + 'M', out: 'Mask' } }, pos));
    };
    if (k === 'grain') {
      tools.push(noise(out, W, H, { Detail: 10, Contrast: 3, Brightness: -0.5, XScale: 120, YScale: 120, SeetheRate: 6, Color1Alpha: a, Color2Alpha: a }, [0, 0]));
      exposed.push(expose('C1', out, 'Contrast', 'Grain contrast'), expose('C2', out, 'XScale', 'Grain size'), expose('C3', out, 'Color2Alpha', 'Strength'));
    } else if (k === 'dust') {
      tools.push(noise('Specks', W, H, { Detail: 2, Contrast: 20, Brightness: -0.9, XScale: 40, YScale: 40, SeetheRate: 4, Color2Alpha: a }, [0, 0]));
      tools.push(noise('Hairs', W, H, { Detail: 1, Contrast: 30, Brightness: -0.95, XScale: 400, YScale: 2, SeetheRate: 3, Color2Alpha: a * 0.6 }, [0, 80]));
      tools.push(merge(out, 'Specks', 'Hairs', {}, [150, 40]));
      exposed.push(expose('C1', 'Specks', 'Brightness', 'Amount of dust'), expose('C2', 'Hairs', 'Brightness', 'Amount of hairs'));
    } else if (k === 'vignette' || k === 'spot') {
      vignette(out, k === 'spot' ? 0.85 : a, k === 'spot' ? 0.9 : 0, [0, 0], { x: v.cx != null ? v.cx : 0.5, y: v.cy != null ? 1 - v.cy : 0.5 });
      exposed.push(expose('C1', out + 'M', 'Center', k === 'spot' ? 'Spot position' : 'Centre'), expose('C2', out + 'M', 'Width', 'Size'), expose('C3', out + 'M', 'SoftEdge', 'Softness'), expose('C4', out, 'TopLeftAlpha', 'Darkness'));
    } else if (k === 'leak' || k === 'burn' || k === 'flash') {
      const warm = preset.warm !== false, c1 = warm ? '#ff8c28' : '#468cff', c2 = warm ? '#ff3c14' : '#785aff';
      const C1 = rgb(c1), C2 = rgb(c2);
      tools.push(tool('Wash', 'Background', Object.assign(frame(W, H), { Type: 3, TopLeftRed: C1[0], TopLeftGreen: C1[1], TopLeftBlue: C1[2], TopLeftAlpha: a, TopRightRed: C2[0], TopRightGreen: C2[1], TopRightBlue: C2[2], TopRightAlpha: a, BottomLeftRed: C2[0], BottomLeftGreen: C2[1], BottomLeftBlue: C2[2], BottomLeftAlpha: a * 0.6, BottomRightRed: C1[0], BottomRightGreen: C1[1], BottomRightBlue: C1[2], BottomRightAlpha: a * 0.3, EffectMask: { src: 'WashM', out: 'Mask' } }), [0, 0]));
      if (k === 'flash') { tools.push(solid('Flash', W, H, '#ffffff', 1, { Blend: { src: 'FlashBlend', out: 'Value' } }, [0, 0])); tools.push(spline('FlashBlend', [{ f: 0, v: 0 }, { f: 5, v: 1 }, { f: 10, v: 0 }])); out = 'Flash'; }
      else {
        tools.push(tool('WashM', 'EllipseMask', { Center: { expr: warm ? `Point(1.05 - 0.1 * sin(time / ${k === 'burn' ? 4 : 15}), 0.5)` : `Point(0.5, 1.1 - 0.1 * sin(time / 15))` }, Width: k === 'burn' ? { src: 'BurnSize', out: 'Value' } : 1.4, Height: 1.6, SoftEdge: 0.6 }, [0, 60]));
        if (k === 'burn') tools.push(spline('BurnSize', [{ f: 0, v: 0.2 }, { f: 12, v: 2.2 }, { f: 25, v: 0.2 }]));
        tools.push(tool(out, 'Transform', { Input: { src: 'Wash' } }, [150, 0]));
        exposed.push(expose('C1', 'Wash', 'TopLeftAlpha', 'Strength'), expose('C2', 'WashM', 'SoftEdge', 'Softness'));
      }
    } else if (k === 'letterbox') {
      const ratio = v.ratio || 2.39, h = Math.min(1, (W / ratio) / H);
      tools.push(tool('BarsM', 'RectangleMask', { Center: { x: 0.5, y: 0.5 }, Width: 1.2, Height: h, Invert: 1, SoftEdge: 0 }, [0, 60]));
      tools.push(solid(out, W, H, '#000000', 1, { EffectMask: { src: 'BarsM', out: 'Mask' } }, [0, 0]));
      exposed.push(expose('C1', 'BarsM', 'Height', 'Picture height (2.39:1 = ' + num(h) + ')'));
    } else if (k === 'gate') {
      tools.push(tool('GateM', 'RectangleMask', { Center: { x: 0.5, y: 0.5 }, Width: 0.96, Height: 0.96, CornerRadius: 0.06, Invert: 1, SoftEdge: 0.01 }, [0, 60]));
      tools.push(solid('Gate', W, H, '#000000', 1, { EffectMask: { src: 'GateM', out: 'Mask' } }, [0, 0]));
      vignette('Vig', 0.55, 0.4, [150, 0]);
      tools.push(merge(out, 'Vig', 'Gate', {}, [300, 0]));
      exposed.push(expose('C1', 'GateM', 'Width', 'Gate width'), expose('C2', 'GateM', 'Height', 'Gate height'), expose('C3', 'GateM', 'CornerRadius', 'Corner roundness'));
    } else if (k === 'paper' || k === 'bgpaper') {
      if (k === 'bgpaper') tools.push(solid('Plate', W, H, '#d9cdb4', 1, {}, [0, 0]));
      tools.push(noise('Fibre', W, H, { Detail: 8, Contrast: 1.2, Brightness: 0, XScale: 25, YScale: 25, Color1Red: 0.47, Color1Green: 0.37, Color1Blue: 0.23, Color1Alpha: k === 'paper' ? a : 0.45, Color2Red: 1, Color2Green: 0.98, Color2Blue: 0.92, Color2Alpha: k === 'paper' ? a * 0.5 : 0.35 }, [0, 80]));
      if (k === 'bgpaper') tools.push(merge(out, 'Plate', 'Fibre', {}, [150, 40])); else tools.push(tool(out, 'Transform', { Input: { src: 'Fibre' } }, [150, 80]));
      exposed.push(expose('C1', 'Fibre', 'Color1Alpha', 'Strength'));
    } else if (k === 'scanlines') {
      tools.push(noise(out, W, H, { Detail: 0, Contrast: 4, Brightness: -0.2, XScale: 2000, YScale: 1.2, Color1Alpha: a, Color2Alpha: 0 }, [0, 0]));
      exposed.push(expose('C1', out, 'YScale', 'Line spacing'), expose('C2', out, 'Color1Alpha', 'Strength'));
    } else if (k === 'flicker') {
      tools.push(solid(out, W, H, '#fff3dc', 1, { Blend: { expr: `${num(a)} * abs(sin(time * 2.9) * sin(time * 0.7))` } }, [0, 0]));
    } else if (k === 'bgdust') {
      tools.push(tool('Plate', 'Background', Object.assign(frame(W, H), { Type: 2, TopLeftRed: 0.043, TopLeftGreen: 0.043, TopLeftBlue: 0.05, TopLeftAlpha: 1, BottomLeftRed: 0.11, BottomLeftGreen: 0.1, BottomLeftBlue: 0.098, BottomLeftAlpha: 1 }), [0, 0]));
      tools.push(noise('Dust', W, H, { Detail: 2, Contrast: 14, Brightness: -0.85, XScale: 60, YScale: 60, SeetheRate: 1.5, Color2Red: 0.9, Color2Green: 0.86, Color2Blue: 0.78, Color2Alpha: 0.35 }, [0, 80]));
      tools.push(merge(out, 'Plate', 'Dust', {}, [150, 40]));
    } else if (k === 'bgslate') {
      tools.push(tool(out, 'Background', Object.assign(frame(W, H), { Type: 3, TopLeftRed: 0.17, TopLeftGreen: 0.19, TopLeftBlue: 0.22, TopLeftAlpha: 1, TopRightRed: 0.12, TopRightGreen: 0.13, TopRightBlue: 0.15, TopRightAlpha: 1, BottomLeftRed: 0.1, BottomLeftGreen: 0.11, BottomLeftBlue: 0.13, BottomLeftAlpha: 1, BottomRightRed: 0.08, BottomRightGreen: 0.086, BottomRightBlue: 0.1, BottomRightAlpha: 1 }), [0, 0]));
    } else if (k === 'bgink') {
      tools.push(solid('Plate', W, H, '#060607', 1, {}, [0, 0]));
      tools.push(noise('Bloom', W, H, { Detail: 3, Contrast: 1.6, Brightness: -0.3, XScale: 3, YScale: 3, SeetheRate: 0.2, Color1Alpha: 0, Color2Red: 0.16, Color2Green: 0.19, Color2Blue: 0.3, Color2Alpha: 0.9 }, [0, 80]));
      tools.push(merge(out, 'Plate', 'Bloom', {}, [150, 40]));
    } else if (k === 'bglinen') {
      tools.push(solid('Plate', W, H, '#17171a', 1, {}, [0, 0]));
      tools.push(noise('Weave', W, H, { Detail: 10, Contrast: 2, Brightness: -0.4, XScale: 600, YScale: 600, Color1Alpha: 0, Color2Alpha: 0.12 }, [0, 80]));
      tools.push(merge(out, 'Plate', 'Weave', {}, [150, 40]));
    } else if (k === 'bgspot') {
      tools.push(solid('Plate', W, H, '#050505', 1, {}, [0, 0]));
      tools.push(tool('LightM', 'EllipseMask', { Center: { x: 0.5, y: 0.5 }, Width: 0.9, Height: 0.9, SoftEdge: 0.7 }, [0, 140]));
      tools.push(solid('Light', W, H, '#463e32', 1, { EffectMask: { src: 'LightM', out: 'Mask' } }, [0, 80]));
      tools.push(merge(out, 'Plate', 'Light', {}, [150, 40]));
      exposed.push(expose('C1', 'LightM', 'Center', 'Light position'), expose('C2', 'LightM', 'Width', 'Light size'));
    } else if (k === 'box') {
      const cx = v.cx != null ? v.cx : 0.5, cy = v.cy != null ? 1 - v.cy : 0.5, c = rgb(accent);
      tools.push(tool('HoleM', 'RectangleMask', { Center: { x: cx, y: cy }, Width: 0.24, Height: 0.44, Invert: 1, SoftEdge: 0 }, [0, 60]));
      tools.push(solid('Dim', W, H, '#000000', 0.55, { EffectMask: { src: 'HoleM', out: 'Mask' } }, [0, 0]));
      tools.push(tool('OuterM', 'RectangleMask', { Center: { x: cx, y: cy }, Width: 0.246, Height: 0.451, SoftEdge: 0 }, [150, 60]));
      tools.push(tool('InnerM', 'RectangleMask', { Center: { x: cx, y: cy }, Width: 0.24, Height: 0.44, PaintMode: { fuid: 'Subtract' }, EffectMask: { src: 'OuterM', out: 'Mask' }, SoftEdge: 0 }, [150, 110]));
      tools.push(tool('Line', 'Background', Object.assign(frame(W, H), { TopLeftRed: c[0], TopLeftGreen: c[1], TopLeftBlue: c[2], TopLeftAlpha: 1, EffectMask: { src: 'InnerM', out: 'Mask' } }), [150, 0]));
      tools.push(merge(out, 'Dim', 'Line', {}, [300, 0]));
      exposed.push(expose('C1', 'HoleM', 'Center', 'Box position'), expose('C2', 'HoleM', 'Width', 'Box width'), expose('C3', 'HoleM', 'Height', 'Box height'), expose('C4', 'Line', 'TopLeftRed', 'Line colour', { ControlGroup: 1 }), expose('C5', 'Line', 'TopLeftGreen', '', { ControlGroup: 1 }), expose('C6', 'Line', 'TopLeftBlue', '', { ControlGroup: 1 }));
    } else {
      return null;
    }
    const name = templateName(preset);
    return { name, body: wrapGroup(opName(preset.label), tools, exposed, out), inputs: {}, kind: 'generators', blend: preset.blend || 'normal' };
  }

  /** Every template file the pack installs (defaults in each), for the Effects Library. -> [{name, body, kind}] */
  function all(size) {
    const P = US.mvfxPack, out = [];
    for (const p of P.PRESETS) {
      // a freeze frame's look and name tag are named as the tab names them when it adds them
      if (p.layers && p.layers.length) out.push(title(p.kind === 'freeze' ? Object.assign({}, p, { label: p.label + ' name' }) : p, P.defaults(p), size));
      if (p.paint && p.kind !== 'freeze') out.push(generator(p, null, size));
      if (p.kind === 'freeze' && p.paint) out.push(generator(Object.assign({}, p, { label: p.label + ' look' }), null, size));
      if (p.kind === 'transition' && p.overlay) { const o = P.byId(p.overlay) || { paint: p.overlay, label: p.label, alpha: 0.8 }; out.push(Object.assign(generator(Object.assign({}, o, { label: p.label }), null, size), { name: templateName({ label: p.label }) })); }
    }
    return out.filter(Boolean);
  }

  US.mvfxFusion = { title, generator, all, templateName, opName, input, spline, str, TAG, SRC_END };
})();
