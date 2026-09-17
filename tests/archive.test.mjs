import test from 'node:test';
import assert from 'node:assert/strict';
import {validateArchive,archiveMedia,rankFor,rawTime,sectors,nearest} from '../src/archive.js';
import {loadAnalysis} from '../src/onedrive.js';
const run={athleteId:1,category:'K1',sector:1,descent:1,totalTime:42000,penalties:2,splits:[10000,25000],videoFile:'v.mp4',sensorFile:'s.json',extra:{coach:'note'}};
const archive={documentType:'archive',schemaVersion:1,collection:{name:'Stage'},athletes:[{id:1,name:'Lou'}],runs:[run,{...run,totalTime:41000},{...run},{...run,totalTime:null},{...run,sector:2,totalTime:15000}]};
test('Données préservées, chemins médias stricts, version explicite',()=>{
 assert.deepEqual(validateArchive(archive).runs[0].extra,{coach:'note'});
 for(const videoFile of ['../video.mp4','https://evil.example/v','a\\b.mp4',''])assert.throws(()=>validateArchive({...archive,runs:[{...run,videoFile}]}));
 assert.throws(()=>validateArchive({...archive,schemaVersion:2}));
 assert.equal(archiveMedia(archive)[0][1].file,'v.mp4');
});
test('Rang avec ex æquo, exclusion des chronos absents et secteurs différents',()=>{
 assert.deepEqual(rankFor(archive,run),{place:2,count:3,gap:1000});
 assert.equal(rankFor(archive,archive.runs[3]),null);
 assert.equal(rawTime(run),40000);assert.equal(rawTime({...run,totalTime:null}),null);
 assert.deepEqual(sectors(run).map(x=>x.segment),[10000,15000,15000]);
 assert.equal(nearest([{time:0,bpm:80},{time:1000,bpm:120}],800).bpm,120);
});
test('Archive Graph : seul le manifeste téléchargé, références médias directes',async()=>{
 const calls=[];const response=x=>new Response(JSON.stringify(x));
 const result=await loadAnalysis('https://1drv.ms/f/demo',{getToken:async()=>'token',fetcher:async(url,options)=>{
  calls.push(url);
  if(url==='https://download.example/json'){assert.equal(options.headers,undefined);return response(archive);}
  if(url.endsWith('/driveItem'))return response({folder:{},name:'Nom technique'});
  return response({value:[['archive.json','json'],['v.mp4','video'],['s.json','sensor']].map(([name,suffix])=>({name,file:{},'@microsoft.graph.downloadUrl':`https://download.example/${suffix}`}))});
 }});
 assert.equal(result.name,'Stage');assert.equal(result.model,null);assert.equal(result.sources['r0-video'],'https://download.example/video');
 assert(!calls.includes('https://download.example/video'));assert(!calls.includes('https://download.example/sensor'));
});
