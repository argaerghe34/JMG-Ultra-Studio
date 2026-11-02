/* JMG Ultra Studio – Silence Cut › Punch-ins: where a cut leaves the same shot either side (a jump cut), every other
   piece is pushed in a little – 100 %, 110 %, 100 %… – so the cut reads as a change of framing, as an editor would
   hide it. Only the pieces of one shot that meet at a cut are changed; a new shot starts back at 100 %. Uses the clip's
   own Motion/zoom (Premiere's Scale, Resolve's Zoom) – no new layers, so it stays easy to change by hand. */
(function () {
  'use strict';
  const US = window.US;

  /**
   * Which pieces of a track to push in: runs of pieces of the same clip that meet with the source jumping forward
   * (a cut), alternate pieces of each run. -> [{start, end, name}] (the ones to scale)
   */
  function plan(clips, { frame = 1 / 25 } = {}) {
    const cs = (clips || []).filter(c => !c.disabled).slice().sort((a, b) => a.start - b.start), out = [];
    let run = 0;
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i - 1], c = cs[i];
      const jump = p && p.name === c.name && Math.abs(c.start - p.end) <= frame * 1.5 && c.in > p.out + frame / 2;
      run = jump ? run + 1 : 0;
      if (run % 2) out.push({ start: c.start, end: c.end, name: c.name });
    }
    return out;
  }
  /** The track with the talking: the lowest video track with more than one piece (B-roll above it is left alone). */
  const talkingTrack = info => (info.video || []).find(t => (t.clips || []).length > 1) || null;
  /** Push in the jump cuts of a sequence. -> {done, jumps, track, skipped} */
  async function apply(seqId, { scale = 110, track = null, job } = {}) {
    const info = await US.host.call('sequenceInfo', { seqId });
    const tr = track != null ? (info.video || [])[track] : talkingTrack(info);
    if (!tr) return { done: 0, jumps: 0, track: null, skipped: [] };
    const steps = plan(tr.clips, { frame: info.frame || 1 / (info.fps || 25) });
    if (!steps.length) return { done: 0, jumps: 0, track: tr.index, skipped: [] };
    job && job.set({ who: 'premiere', msg: `Punching in on ${US.plural(steps.length, 'jump cut')}` });
    const r = await US.host.call('editApply', { seqId, op: 'motion', params: { scale: Math.max(101, Math.min(150, +scale || 110)) }, targets: steps.map(x => ({ kind: 'video', track: tr.index, start: x.start })) });
    return { done: r.done || 0, jumps: steps.length, track: tr.index, skipped: r.skipped || [] };
  }

  US.actions.register({
    id: 'silence.punch', tool: 'silence', title: 'Punch in on the jump cuts', changes: true,
    describe: 'In the active sequence, every other piece of a shot that was cut (a jump cut) is pushed in a little (110 %), so the cuts read as changes of framing. Run it on a cut copy – it changes the sequence it’s run on.',
    params: { scale: { type: 'number', default: 110, desc: 'How far to push in, in percent (105–130)' } },
    examples: ['punch in on the jump cuts', 'hide the jump cuts with zooms', 'add punch-ins'],
    match: t => (/\bpunch[- ]?ins?\b|\b(hide|cover|soften)\b.*\bjump ?cuts?\b.*\b(zoom|punch|scale)|\bzoom\b.*\bjump ?cuts?\b/i.test(t) && !/\bb-?roll\b/i.test(t) ? Object.assign({ _score: 2.6 }, /(\d{3})\s*%/.test(t) ? { scale: +/(\d{3})\s*%/.exec(t)[1] } : {}) : null),
    run: async (p, job) => {
      const seq = US.ctx.sequence;
      if (!seq) throw new US.UserError('NO_SEQUENCE');
      const r = await apply(seq.id, { scale: p.scale, job });
      if (!r.jumps) return { summary: `No jump cuts found in “${seq.name}” – pieces of the same clip meeting at a cut.` };
      return { summary: `Pushed in ${r.done} of ${US.plural(r.jumps, 'jump cut')} to ${p.scale || 110} % on V${r.track + 1} of “${seq.name}”.${r.skipped.length ? ` ${r.skipped.length} couldn’t be changed.` : ''}` };
    }
  });

  US.punchIns = { plan, apply, talkingTrack };
})();
