const out = {
  transcript: typeof US.transcript, story: !!US.tools.get('story'), assistant: !!US.tools.get('assistant'), storyApi: typeof US.story,
  actions: US.actions.list().map(a => a.id),
  css: Array.from(document.querySelectorAll('link')).map(l => l.href.split('/').pop())
};
try { out.storyFn = await US.host.rawEval('typeof UStudio.fn.storyClips', 5000); } catch (e) { out.storyFn = 'ERR ' + e.message; }
out.job = US.jobs.current ? US.jobs.current.title : null;
return out;
