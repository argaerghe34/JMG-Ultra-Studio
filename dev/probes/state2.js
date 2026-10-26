return { job: US.jobs.current && US.jobs.current.title, tools: US.tools.list().length, last: US.log.entries().slice(-4).map(e => e.text) };
