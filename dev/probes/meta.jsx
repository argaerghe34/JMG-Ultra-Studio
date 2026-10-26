(function(){ var out=[]; try {
 var it = UStudio.itemById('000f427e');
 var cols = it.getProjectColumnsMetadata(); out.push('columns: ' + String(cols).length + ' chars');
 var x = it.getProjectMetadata(); out.push('xmp: ' + String(x).length + ' chars');
 var pick = function (n) { var m = new RegExp('Column\\.Intrinsic\\.' + n + '>([^<]*)<').exec(x); return m ? m[1] : '(none)'; };
 out.push('MediaDuration=' + pick('MediaDuration') + ' VideoInfo=' + pick('VideoInfo') + ' AudioInfo=' + pick('AudioInfo') + ' MediaTimebase=' + pick('MediaTimebase') + ' MediaStart=' + pick('MediaStart'));
 var vi = /Column\.Intrinsic\.VideoInfo[^>]*>/.exec(x); out.push('VideoInfo tag: ' + (vi ? vi[0] : 'none'));
 try { var o = it.getOutPoint(1); out.push('outV=' + o.seconds); } catch (e) { out.push('outV err ' + e); }
 try { var fi = it.getFootageInterpretation(); out.push('fps=' + fi.frameRate); } catch (e) { out.push('fi err ' + e); }
 } catch (e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join('\n'); })()
