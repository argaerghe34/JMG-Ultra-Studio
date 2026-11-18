// JMG Ultra Studio – Deliver › Other editors (Premiere side, ES3): a sequence out as FCP 7 XML, and an FCP 7 XML file
// in as a new sequence. Same commands, arguments and results as resolve/host/nle.js. The converting (FCPXML, EDL,
// OTIO ↔ FCP 7 XML) is in the panel: js/tools/33-deliver-nlexml.js. Never changes or saves the user's sequence.
(function (U) {
    var fn = U.fn;
    function newTextFiles(folder, before) {
        var out = [], fs = new Folder(folder).getFiles('*.txt');
        for (var i = 0; i < fs.length; i++) if (!before[fs[i].fsName] && /translation/i.test(fs[i].name)) out.push(fs[i].fsName);
        return out;
    }
    /**
     * Premiere's own FCP 7 XML of a sequence. a: {seqId, path} -> {path, native: 'xmeml', report}
     * (report: Premiere's "FCP Translation Results" text when it writes one – what it couldn't put in the XML).
     */
    fn.nleExport = function (a) {
        var seq = U.needSeq(a.seqId), f = new File(a.path), dir = f.parent;
        if (!dir.exists) dir.create();
        var before = {}, old = dir.getFiles('*.txt'), i;
        for (i = 0; i < old.length; i++) before[old[i].fsName] = true;
        if (f.exists) f.remove();
        var ok = false, why = '';
        try { ok = seq.exportAsFinalCutProXML(f.fsName, 1); } catch (e) { why = String(e.message || e); }
        if (!new File(f.fsName).exists) throw U.err('HOST_SCRIPT', 'exportAsFinalCutProXML wrote nothing (' + (why || ok) + ')', 'Premiere didn’t write the XML file.', 'Check the export folder can be written to, then try again.');
        var report = '', rf = newTextFiles(dir.fsName, before);
        if (rf.length) { var t = new File(rf[0]); t.encoding = 'UTF-8'; if (t.open('r')) { report = t.read(); t.close(); } }
        return { path: f.fsName, native: 'xmeml', report: report };
    };
    /**
     * An FCP 7 XML file as a new sequence (and its clips) in a bin. a: {path, name, binPath} -> {seqId, name, clips}
     * The panel converts FCPXML, EDL and OTIO to FCP 7 XML first, with the media paths already found.
     */
    fn.nleImport = function (a) {
        var f = new File(a.path);
        if (!f.exists) throw U.err('NOTHING_FOUND', 'Not on disk: ' + a.path, 'That timeline file isn’t there any more.', 'Choose it again.');
        var P = U.project(), seqs = P.sequences, before = {}, i;
        for (i = 0; i < seqs.numSequences; i++) before[seqs[i].sequenceID] = true;
        var bin = U.ensureBin(a.binPath || 'JMG Ultra Studio/From other editors');
        P.importFiles([f.fsName], true, bin, false);
        var made = null;
        seqs = P.sequences;
        for (i = 0; i < seqs.numSequences; i++) if (!before[seqs[i].sequenceID]) { made = seqs[i]; break; }
        if (!made) throw U.err('HOST_SCRIPT', 'importFiles made no sequence from ' + a.path, 'Premiere couldn’t read that timeline file.', 'Open it in the editor that made it and export it again, then try once more.');
        if (a.name && made.name !== a.name) { try { made.name = a.name; } catch (e) { } }
        var clips = 0, t;
        for (t = 0; t < made.videoTracks.numTracks; t++) clips += made.videoTracks[t].clips.numItems;
        for (t = 0; t < made.audioTracks.numTracks; t++) clips += made.audioTracks[t].clips.numItems;
        return { seqId: made.sequenceID, name: made.name, clips: clips };
    };
})(UStudio);
