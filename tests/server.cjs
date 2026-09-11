'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {serve}=require('../runtime.cjs'),Transport=require('../probe.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-server-'));
let server,calls=0;
(async()=>{
  server=serve(0,{dataDir:dir,defaults:{baseUrl:'',model:'gpt-6-astra',protocol:'chat'},runProbe:async()=>{calls++;throw Error('Unexpected provider call')},endpointOf:Transport.endpointOf,validate:()=>{}});
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const state=await (await fetch(origin+'/api/dashboard')).json();
  assert.equal(state.release,'4.1.0');assert.equal(state.records.length,0);assert.equal(state.schedules.length,0);
  assert.equal(state.profiles[0].baseUrl,'');assert.equal(state.profiles[0].connected,false);
  assert.equal(state.appearance.threshold,.32);
  const html=await (await fetch(origin+'/')).text();assert(html.includes('新建批量检测'));
  const post=(value,headers={Origin:origin})=>fetch(origin+'/api/appearance',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  assert.equal((await post({threshold:.4},{Origin:'https://example.invalid'})).status,403);
  const settings=await (await post({enabled:false,threshold:.4})).json();
  assert.equal(settings.threshold,.4);assert.equal(settings.enabled,false);
  assert.equal((await post({threshold:2})).status,400);
  assert.equal(calls,0);
  const configured=await fetch(origin+'/api/profiles',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({id:'default',name:'Fixture',baseUrl:'http://127.0.0.1:9',model:'mock',keyOptional:true,remember:false})});
  assert.equal(configured.status,200);assert.equal((await configured.json()).connected,true);
  console.log('Fresh install, origin enforcement and adjustable appearance API passed.');
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
});
