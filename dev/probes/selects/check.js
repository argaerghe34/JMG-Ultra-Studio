return { fn: (await US.host.call("listFns")).filter(f => /selects/.test(f)), bins: (await US.host.call("listBins")).map(b => b.path).filter(p => /Selects/.test(p)) };
