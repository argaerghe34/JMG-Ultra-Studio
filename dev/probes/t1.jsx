(function(){ try { $.evalFile("/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/jsx/host.jsx"); } catch(e){ return 'LOAD ERR '+e+' line '+e.line; }
 var out=[]; var calls=[['ping','{}'],['context','{}'],['listBins','{}'],['listSequences','{}'],['selectionSummary','{"kinds":["video"]}']];
 for (var i=0;i<calls.length;i++) out.push(calls[i][0]+' => '+UStudio.run(calls[i][0], calls[i][1]));
 var bins=JSON.parse(UStudio.run('listBins','{}')).data; var probe=null; for (var i=0;i<bins.length;i++) if (bins[i].path=='Probe') probe=bins[i].id;
 out.push('binItems => '+UStudio.run('binItems', JSON.stringify({binId:probe, kinds:['video','audio'], recursive:true})));
 var seqs=JSON.parse(UStudio.run('listSequences','{}')).data;
 out.push('sequenceInfo => '+UStudio.run('sequenceInfo', JSON.stringify({seqId:seqs[1].id})).substring(0,900));
 out.push('presets => '+UStudio.run('presets','{}'));
 out.push('bad => '+UStudio.run('nope','{}'));
 return out.join('\n'); } catch(e){ return 'ERR '+e+' line '+e.line; } })()
