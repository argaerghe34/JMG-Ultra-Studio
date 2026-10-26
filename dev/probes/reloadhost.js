const out = {};
out.dir = US.host.extensionDir();
try { out.loaded = await US.host.loadScripts(); } catch (e) { out.loadErr = e.detail || e.message; }
try { out.fns = (await US.host.call('listFns')).length; } catch (e) { out.callErr = e.detail || e.message; }
out.raw = await US.host.rawEval('typeof UStudio.fn.listFns', 5000);
return out;
