const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRuntime}=require('../runtime.cjs');
const Core=require('../core.cjs'),Bench=require('../benchmark.cjs'),Visual=require('../visual.cjs');
const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'astra-batch-')),events=[],active=new Set();let peak=0,release,flaky=true;
const defaults={baseUrl:'http://127.0.0.1:1',model:'mock-astra',protocol:'chat',reasoning:'medium',maxTokens:8192,timeout:10,tokenField:'max_tokens',keyOptional:true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await sleep(20)}throw Error('Timed out')}
const html='<!doctype html><html><body><svg width="600" height="400"><circle cx="100" cy="100" r="50"><animate attributeName="cx" values="100;500;100" dur="1s" repeatCount="indefinite"/></circle></svg></body></html>';
async function runProbe(config,signal){
  const id=crypto.randomUUID();active.add(id);peak=Math.max(peak,active.size);events.push({type:'start',task:config.task,time:Date.now()});
  try{
    await new Promise((resolve,reject)=>{const t=setTimeout(resolve,70);signal.addEventListener('abort',()=>{clearTimeout(t);reject(Error('cancelled'))},{once:true})});
    if(config.model==='flaky'&&flaky){flaky=false;throw Object.assign(Error('503 temporary'),{retryable:true,statusCode:503})}
    const answer=config.task==='candy'?'最少需要'+config.taskSpec.expected+'颗。':html;
    return {id,timestamp:new Date().toISOString(),task:config.task,model:config.model,returnedModel:config.model,answer,judgment:Core.judge(config.task,answer,config.taskSpec),rulesVersion:Core.VERSION,elapsedMs:70};
  }finally{active.delete(id)}
}
const originalCapture=Visual.captureArtifact,originalVision=Visual.evaluateVision;
Visual.captureArtifact=async(source,folder)=>{fs.mkdirSync(folder,{recursive:true});for(let i=0;i<3;i++)fs.writeFileSync(path.join(folder,'frame-'+i+'.png'),'mock');fs.writeFileSync(path.join(folder,'thumbnail.webp'),'mock');return {version:Visual.VERSION,frames:['frame-0.png','frame-1.png','frame-2.png'],nonBlank:true,hasMotion:true,errors:[]}};
Visual.evaluateVision=async()=>{if(release)await release;return {status:'pass',label:'自动评估通过',score:85,confidence:.9,dimensions:[],issues:[],evaluatedAt:new Date().toISOString()}};
const options={dataDir:root,defaults,runProbe,endpointOf:x=>x,validate:()=>{}};
let rt;
(async()=>{
  rt=createRuntime(options);await rt.ready;
  await rt.saveProfile({...defaults,id:'default',name:'Mock',keyOptional:true});
  let finishVision;release=new Promise(r=>finishVision=r);
  const b=rt.startBatch({rounds:3,concurrency:2,tasks:['candy','pelican'],variant:'varied',seed:'same-seed'});
  await until(()=>rt.records().length===6);
  assert.equal(peak,2);assert.equal(rt.batchReport(b.id).completed,3);
  assert.equal(new Set(rt.records().filter(r=>r.task==='candy').map(r=>r.taskSpec.promptHash)).size,3);
  finishVision();release=null;await until(()=>rt.batchReport(b.id).status==='done');
  assert.equal(rt.records().length,6);assert.equal(rt.batchReport(b.id).stats[0].summary.pelican.meanScore,85);
  const base=rt.setBaseline(b.id,'default');assert(base.signature);
  const baseRecords=rt.records().length;
  const paused=rt.startBatch({rounds:10,concurrency:2,tasks:['candy','pelican']});
  rt.controlBatch(paused.id,'pause');await sleep(150);assert.equal(rt.records().length,baseRecords);
  rt.controlBatch(paused.id,'resume');await until(()=>active.size===2);rt.controlBatch(paused.id,'cancel');await until(()=>active.size===0);
  assert.equal(rt.batchReport(paused.id).status,'cancelled');
  await rt.saveProfile({...defaults,id:'default',name:'Mock',model:'flaky',keyOptional:true});
  const retry=rt.startBatch({rounds:1,concurrency:1,retries:1,tasks:['candy']});
  await until(()=>rt.batchReport(retry.id).status==='done');
  const retried=rt.records().find(r=>r.batchId===retry.id);assert.equal(retried.attempt,2);assert.equal(retried.attempts.length,1);assert.equal(retried.judgment.status,'pass');
  const queued=rt.startBatch({rounds:3,concurrency:2,tasks:['candy']});rt.controlBatch(queued.id,'pause');
  rt.close();await sleep(100);rt=createRuntime(options);await rt.ready;
  assert.equal(rt.batchReport(queued.id).status,'paused');
  assert.equal(rt.records().filter(r=>r.batchId===b.id).length,6);
  rt.controlBatch(queued.id,'resume');await until(()=>rt.batchReport(queued.id).status==='done');
  assert.equal(rt.batchReport(queued.id).total,3);
  const values=Bench.solveCandy([[2,2,2],[2,2,2]]);
  const brute=[];
  for(let ar=0;ar<=2;ar++)for(let pr=0;pr<=2;pr++)for(let wr=0;wr<=2;wr++)for(let as=0;as<=2;as++)for(let ps=0;ps<=2;ps++)for(let ws=0;ws<=2;ws++)if(!(ar&&ps||pr&&as))brute.push([ar+pr+wr,as+ps+ws]);
  let min=99;for(let r=0;r<=6;r++)for(let s=0;s<=6;s++)if(!brute.some(x=>x[0]===r&&x[1]===s))min=Math.min(min,r+s);
  assert.equal(values.minimum,min);
  assert.equal(Bench.solveCandy([[7,9,8],[7,6,4]]).minimum,21);
  const poor=Bench.summarize(Array.from({length:20},()=>({task:'candy',judgment:{status:'fail'},elapsedMs:100})));
  const good=Bench.summarize(Array.from({length:20},()=>({task:'candy',judgment:{status:'pass'},elapsedMs:100})));
  assert.equal(Bench.compare(poor,good).status,'regression');
  assert.equal(Bench.compare(poor,good,false).status,'conditions_changed');
  console.log(JSON.stringify({passed:true,peak,checks:['two tasks actually overlap','generation not blocked by vision','3 rounds exactly 6 outputs','variant oracle','pause/resume/cancel','503 backoff retry','no duplicate record on retry','persisted paused batches resume','baseline comparisons','brute force oracle check'],root}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{rt?.close();Visual.captureArtifact=originalCapture;Visual.evaluateVision=originalVision});
