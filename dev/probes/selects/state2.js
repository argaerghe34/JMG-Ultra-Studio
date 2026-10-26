return { tools: US.tools.list().map(t => t.id), ctx: US.ctx.project && US.ctx.project.name, vision: US.vision && US.vision.VERSION };
