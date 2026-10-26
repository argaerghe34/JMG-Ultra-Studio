(function () { try {
  var out = [];
  var bins = JSON.parse(UStudio.run('listBins', '{}')).data, binId = null;
  for (var i = 0; i < bins.length; i++) if (bins[i].path === 'Test – Selects') binId = bins[i].id;
  var items = JSON.parse(UStudio.run('binItems', JSON.stringify({ binId: binId, kinds: ['video'], recursive: false }))).data;
  var c1 = null; for (var i = 0; i < items.length; i++) if (items[i].name.indexOf('C001') === 0) c1 = items[i];
  var it = UStudio.needItem(c1.id);
  var bin = UStudio.ensureBin('Test – Selects/probe');
  var sc = it.createSubClip('PROBE_SUB', UStudio.secToTicks(2), UStudio.secToTicks(5), 0, 1, 1);
  sc.moveBin(bin); sc.setColorLabel(5);
  out.push('sub in=' + sc.getInPoint().seconds + ' out=' + sc.getOutPoint().seconds + ' label=' + sc.getColorLabel());
  var seqR = JSON.parse(UStudio.run('newSequence', JSON.stringify({ name: 'Probe subclip seq', binPath: 'Test – Selects/probe', likeId: c1.id }))).data;
  var seq = UStudio.needSeq(seqR.id);
  var ok = seq.videoTracks[0].overwriteClip(sc, 0);
  var ti = seq.videoTracks[0].clips[0];
  out.push('placed ok=' + ok + ' start=' + ti.start.seconds + ' end=' + ti.end.seconds + ' in=' + ti.inPoint.seconds + ' out=' + ti.outPoint.seconds + ' audio=' + seq.audioTracks[0].clips.numItems);
  var xml = '/private/tmp/claude-501/-Users-jgersch-Downloads-WhatsApp-Chat-with-Tab/dfdca15a-57c0-4de5-9767-1734b1f0ead1/scratchpad/probe-sub.xml';
  seq.exportAsFinalCutProXML(xml, 1);
  var f = new File(xml); f.open('r'); var s = f.read(); f.close();
  var m = s.match(/<label2>[^<]*<\/label2>/g);
  out.push('xml labels=' + (m ? m.join(' ') : 'none'));
  return out.join('\n');
} catch (e) { return 'ERR ' + e + ' line ' + e.line; } })()
