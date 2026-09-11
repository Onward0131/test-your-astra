'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRuntime}=require('../runtime.cjs');
const Core=require('../core.cjs'),Visual=require('../visual.cjs');
const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'astra-boundary-')),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<600;i++){if(fn())return;await sleep(10)}throw Error('Timed out')}
const html='<!doctype html><html><svg><circle r="20"><animate attributeName="cx" values="10;100;10" dur="1s" repeatCount="indefinite"/></circle></svg></html>';
const defaults={baseUrl:'http://127.0.0.1:9',model:'mock-astra',protocol:'chat',reasoning:'medium',maxTokens:8192,timeout:10,tokenField:'max_tokens',keyOptional:true};
let active=0,peak=0,score=85,release=null,rt,pasteRuntime,truncatedRuntime,visionCalls=0;
const savedCapture=Visual.captureArtifact,savedVision=Visual.evaluateVision;
Visual.captureArtifact=async(source,folder)=>{fs.mkdirSync(folder,{recursive:true});const frames=[0,1,2].map(i=>'frame-'+i+'.png');for(const file of frames)fs.writeFileSync(path.join(folder,file),'mock');fs.writeFileSync(path.join(folder,'thumbnail.webp'),'mock');return {version:Visual.VERSION,frames,nonBlank:true,hasMotion:true,errors:[]}};
Visual.evaluateVision=async(record,capture,folder,p,key,signal)=>{visionCalls++;if(release)await Promise.race([release,new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))]);return {status:'pass',label:'模拟评分',score,dimensions:[],issues:[]}};
const options={dataDir:root,defaults,endpointOf:x=>x,validate:()=>{},runProbe:async(config,signal)=>{
  active++;peak=Math.max(peak,active);
  try{await sleep(65);signal.throwIfAborted();const answer=config.task==='candy'?'最少需要'+config.taskSpec.expected+'颗。':html;return {id:crypto.randomUUID(),timestamp:new Date().toISOString(),task:config.task,model:config.model,answer,judgment:Core.judge(config.task,answer,config.taskSpec),rulesVersion:Core.VERSION,elapsedMs:65}}finally{active--}
}};
(async()=>{
  rt=createRuntime(options);await rt.ready;await rt.saveProfile({...defaults,id:'default',name:'边界测试'});
  assert.throws(()=>rt.saveLimits({generation:1,evaluation:9}));
  const atomic=rt.startBatch({rounds:2,concurrency:2,tasks:['candy']});await until(()=>rt.batchReport(atomic.id).status==='done');assert.equal(peak,2);
  let unblock;release=new Promise(r=>unblock=r);
  const original=rt.startBatch({rounds:2,concurrency:2,tasks:['pelican'],seed:'repeatable'});
  await until(()=>rt.jobs.filter(j=>j.batch===original.id&&j.operation==='evaluate').length===2);
  const cancelled=rt.jobs.find(j=>j.batch===original.id&&j.operation==='evaluate'&&j.status==='queued');
  assert(cancelled);rt.cancelJob(cancelled.id);
  assert.equal(rt.jobs.find(j=>j.id===cancelled.parentId).status,'cancelled');
  unblock();release=null;await until(()=>rt.batchReport(original.id).status==='done');
  assert.equal(rt.records().filter(r=>r.batchId===original.id).length,2);
  const prior=rt.batchReport(original.id).results.find(r=>r.id===cancelled.recordId).autoEvaluation;
  assert.equal(prior.status,'unavailable');
  score=98;const retry=rt.retryBatch(original.id);await until(()=>rt.batchReport(retry.id).status==='done');
  assert.equal(rt.batchReport(retry.id).requests.length,1);
  assert.equal(rt.batchReport(retry.id).requests[0].operation,'evaluate');
  assert.equal(rt.records().filter(r=>r.batchId===original.id).length,2);
  assert.equal(rt.batchReport(retry.id).results[0].autoEvaluation.score,98);
  assert.deepEqual(rt.batchReport(original.id).results.find(r=>r.id===cancelled.recordId).autoEvaluation,prior);
  const repeat=rt.repeatBatch(original.id);await until(()=>rt.batchReport(repeat.id).status==='done');
  assert.equal(repeat.seed,original.seed);assert.equal(repeat.rounds,2);assert.equal(repeat.concurrency,2);
  assert.equal(rt.batchReport(repeat.id).results.length,2);assert.equal(rt.batchReport(repeat.id).results[0].autoEvaluation.score,98);
  // Simulate a process dying while vision is running.
  rt.close();const file=path.join(root,'queue.json'),saved=JSON.parse(fs.readFileSync(file));
  const interrupted=saved.jobs.find(j=>j.batch===repeat.id&&j.operation==='evaluate');interrupted.status='running';delete interrupted.resultEvaluation;
  saved.jobs.find(j=>j.id===interrupted.parentId).status='waiting_eval';fs.writeFileSync(file,JSON.stringify(saved));
  const rows=JSON.parse(fs.readFileSync(path.join(root,'records.json')));rows.find(r=>r.id===interrupted.recordId).autoEvaluation={status:'evaluating'};
  fs.writeFileSync(path.join(root,'records.json'),JSON.stringify(rows));
  rt=createRuntime(options);await rt.ready;
  assert.equal(rt.jobs.find(j=>j.id===interrupted.id).status,'interrupted');
  const recovered=rt.batchReport(repeat.id).results.find(r=>r.id===interrupted.recordId).autoEvaluation;assert.equal(recovered.status,'unavailable');
  score=99;const recoveredRetry=rt.retryBatch(repeat.id);await until(()=>rt.batchReport(recoveredRetry.id).status==='done');
  assert.equal(rt.batchReport(recoveredRetry.id).requests.length,1);
  assert.deepEqual(rt.batchReport(repeat.id).results.find(r=>r.id===interrupted.recordId).autoEvaluation,recovered);
  // No Key: pasted work still saves exactly once, with an actionable evaluation status.
  pasteRuntime=createRuntime({...options,dataDir:root+'-paste',defaults:{...defaults,keyOptional:false}});await pasteRuntime.ready;
  const pasted=pasteRuntime.savePasted('pelican',html);
  assert.equal(pasteRuntime.records().length,1);assert.equal(pasted.autoEvaluation.status,'unavailable');
  assert(fs.existsSync(path.join(root+'-paste','artifacts',pasted.id,'preview.html')));
  truncatedRuntime=createRuntime({...options,dataDir:root+'-truncated',runProbe:async(...args)=>({...await options.runProbe(...args),finishReason:'length'})});await truncatedRuntime.ready;
  await truncatedRuntime.saveProfile({...defaults,id:'default',name:'截断测试'});
  const beforeCalls=visionCalls,truncated=truncatedRuntime.startBatch({rounds:1,tasks:['pelican']});
  await until(()=>truncatedRuntime.batchReport(truncated.id).status==='done');
  assert.equal(visionCalls,beforeCalls);assert.equal(truncatedRuntime.batchReport(truncated.id).stats[0].summary.pelican.pass,0);
  const cutRecord=truncatedRuntime.records()[0];assert.equal(cutRecord.autoEvaluation.status,'uncertain');
  const evalJob=truncatedRuntime.enqueueAssessment(cutRecord.id);await until(()=>!['queued','running'].includes(evalJob.status));
  assert.equal(cutRecord.autoEvaluation.status,'uncertain');
  console.log(JSON.stringify({passed:true,checks:['limits atomicity','cancel queued evaluation settles parent','retry evaluation once without generation','historical score immutable','same-condition repeat','interrupted assessment snapshot survives retry','paste saves without evaluator key','truncated output never passes']}));
})().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(()=>{rt?.close();pasteRuntime?.close();truncatedRuntime?.close();Visual.captureArtifact=savedCapture;Visual.evaluateVision=savedVision});
