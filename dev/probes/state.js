return {w: innerWidth, h: innerHeight, log: US.log.entries().map(e=>e.level+": "+e.text+" "+e.detail).slice(-8)};
