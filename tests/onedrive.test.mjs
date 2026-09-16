import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {sharingToken,loadAnalysis}=await import('../src/onedrive.js');
const demo=JSON.parse(await readFile(new URL('../exemple/analyse.json',import.meta.url),'utf8'));
const link='https://1drv.ms/f/example';
const json=x=>new Response(JSON.stringify(x),{status:200});
test('Partage UTF8 et rejet des liens étrangers',()=>{
  const url='https://onedrive.live.com/?id=été';
  assert.equal(sharingToken(url),'u!'+Buffer.from(new URL(url).href).toString('base64url'));
  assert.throws(()=>sharingToken('https://evil.example/folder'));
});
test('Pagination, médias directs, aucun jeton transmis au téléchargement',async()=>{
  const calls=[];
  const result=await loadAnalysis(link,{getToken:async()=>'test-token',fetcher:async(url,options)=>{
    calls.push(url);
    if(url==='https://download.example/json'){assert.equal(options.headers,undefined);return json(demo);}
    assert.equal(options.headers.Authorization,'Bearer test-token');
    if(url.endsWith('/driveItem'))return json({folder:{},name:'Stage'});
    if(url.endsWith('/children'))return json({value:[{file:{},name:'analyse.json',size:2000,'@microsoft.graph.downloadUrl':'https://download.example/json'}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/next'});
    return json({value:[{file:{},name:'demonstration.mp4','@microsoft.graph.downloadUrl':'https://download.example/video'},{file:{},name:'note.m4a','@microsoft.graph.downloadUrl':'https://download.example/audio'}]});
  }});
  assert.equal(result.model.videos.length,4);assert.equal(result.sources.v0,'https://download.example/video');
  assert(!calls.includes('https://download.example/video'));assert(!calls.includes('https://download.example/audio'));
});
test('403 exploitable et aucune fuite de jeton via pagination',async()=>{
  await assert.rejects(loadAnalysis(link,{getToken:async()=>'token',fetcher:async()=>new Response('',{status:403})}),/accès/);
  let count=0;
  await assert.rejects(loadAnalysis(link,{getToken:async()=>'token',fetcher:async()=>{count++;return count===1?json({folder:{}}):json({value:[],'@odata.nextLink':'https://evil.example/steal'});}}),/Graph inattendue/);
  assert.equal(count,2);
});
