'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PENDING=new Set(['queued','running','retry_wait','waiting_eval','paused']);
const integer=(value,min,max,label)=>{value=Number(value);if(!Number.isInteger(value)||value<min||value>max)throw Error(label+'须为'+min+'～'+max+'的整数。');return value};
function createQueue({file,execute,onChange=()=>{},onFinished=()=>{},onCancel=()=>{},maxGenerate=4,maxEvaluate=1}){
  let saved={};try{saved=JSON.parse(fs.readFileSync(file,'utf8'))}catch(error){if(error.code!=='ENOENT')throw Error('任务队列文件损坏，请从备份恢复。')}
  const jobs=saved.jobs||[],batches=saved.batches||[],controllers=new Map();
  let closed=false,pumping=false,timer;
  for(const b of batches)if(jobs.some(j=>j.batch===b.id&&PENDING.has(j.status)))b.paused=true;
  for(const j of jobs){if(j.status==='running'){j.status='interrupted';j.error='服务中断，未自动重发可能已计费的请求。';j.finishedAt=new Date().toISOString()}else if(['queued','retry_wait'].includes(j.status))j.status='queued';if(j.operation==='thumbnail'&&j.status==='queued')j.status='cancelled'}
  for(const j of jobs)if(j.status==='waiting_eval'&&!jobs.some(x=>x.parentId===j.id&&PENDING.has(x.status))){j.status='interrupted';j.error='视觉评估中断，作品已保留。'}
  function save(){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,jobs,batches}));fs.renameSync(file+'.tmp',file);onChange()}
  function pending(j){return PENDING.has(j.status)}
  function batchOf(j){return batches.find(b=>b.id===j.batch)}
  function configSnapshot(p){const {encryptedKey,apiKey,key,...safe}=p;return safe}
  function addBatch(input){
    const rounds=integer(input.rounds??1,1,100,'轮数'),concurrency=integer(input.concurrency??2,1,8,'并发数'),retries=integer(input.retries??0,0,3,'自动重试次数');
    const tasks=[...new Set(input.tasks||[])],profiles=input.profiles;
    if(!tasks.length||tasks.some(t=>!['candy','pelican'].includes(t)))throw Error('请选择题目。');
    if(!Array.isArray(profiles)||!profiles.length||profiles.length>8)throw Error('请选择1～8个连接。');
    const count=rounds*tasks.length*profiles.length;
    if(jobs.filter(pending).length+count>2000)throw Error('等待队列上限2000个请求。');
    const b={id:crypto.randomUUID(),name:String(input.name||'双题批测').slice(0,100),rounds,concurrency,retries,variant:input.variant==='varied'?'varied':'fixed',seed:String(input.seed||crypto.randomUUID()).slice(0,100),tasks,profiles:profiles.map(configSnapshot),evaluator:input.evaluator,conditionVersion:input.conditionVersion,source:input.source||'manual',scheduleId:input.scheduleId||null,createdAt:new Date().toISOString(),paused:false,retryOf:input.retryOf||null};
    batches.unshift(b);
    for(let round=1;round<=rounds;round++)for(const p of b.profiles)for(const task of tasks){
      jobs.push({id:crypto.randomUUID(),batch:b.id,round,profileId:p.id,profileName:p.name,model:p.model,task,source:b.source,scheduleId:b.scheduleId,operation:'generate',status:'queued',attempt:0,attempts:[],createdAt:b.createdAt});
    }
    save();kick();return b;
  }
  function addJob(data){const j={id:crypto.randomUUID(),createdAt:new Date().toISOString(),status:'queued',attempt:0,attempts:[],...data};jobs.push(j);save();kick();return j}
  function kick(){if(!closed)setImmediate(pump)}
  function canRun(j){
    if(j.status!=='queued'&&!(j.status==='retry_wait'&&j.retryAt<=Date.now()))return false;
    const b=batchOf(j);if(b?.paused||b?.cancelled)return false;
    const running=jobs.filter(x=>x.status==='running');
    if(j.operation==='generate'){
      return running.filter(x=>x.operation==='generate').length<maxGenerate&&running.filter(x=>x.operation==='generate'&&x.batch===j.batch).length<(b?.concurrency||2);
    }
    if(j.operation==='evaluate')return running.filter(x=>x.operation==='evaluate').length<maxEvaluate&&!running.some(x=>x.recordId===j.recordId);
    return running.filter(x=>x.operation==='thumbnail').length<1&&!running.some(x=>x.recordId===j.recordId);
  }
  function pump(){
    if(closed||pumping)return;pumping=true;
    try{
      while(true){
        const next=jobs.find(j=>j.operation==='generate'&&canRun(j))||jobs.find(j=>j.operation==='evaluate'&&canRun(j))||jobs.find(j=>canRun(j));
        if(!next)break;
        next.status='running';next.startedAt=new Date().toISOString();next.attempt++;next.stage=next.operation==='generate'?'generating':next.operation==='evaluate'?'rendering':'thumbnail';
        const ctrl=new AbortController();controllers.set(next.id,ctrl);save();
        run(next,ctrl);
      }
    }finally{pumping=false}
  }
  async function run(j,ctrl){
    let terminal=false;
    try{
      await execute(j,ctrl.signal,batchOf(j));
      if(ctrl.signal.aborted)throw Object.assign(Error('请求已取消。'),{cancelled:true});
      if(j.status==='running')j.status='done';
      terminal=!pending(j);
    }catch(error){
      const cancelled=ctrl.signal.aborted,canRetry=!cancelled&&error.retryable&&j.operation==='generate'&&j.attempt<=(batchOf(j)?.retries||0);
      j.attempts.push({attempt:j.attempt,statusCode:error.statusCode||null,code:error.code||null,message:error.message,elapsedMs:Date.now()-Date.parse(j.startedAt)});
      j.error=error.message;
      if(canRetry){j.status='retry_wait';j.retryAt=Date.now()+Math.max(error.retryAfterMs||0,Math.min(30000,1000*2**(j.attempt-1)));}
      else{j.status=cancelled?'cancelled':'error';j.errorCode=error.code||null;j.statusCode=error.statusCode||null;terminal=true}
    }finally{
      controllers.delete(j.id);
      if(terminal){j.finishedAt=new Date().toISOString();try{await onFinished(j)}catch(error){j.storageError=error.message}}
      save();kick();
    }
  }
  function settleParent(job){
    const parent=jobs.find(j=>j.id===job.parentId);
    if(parent&&parent.status==='waiting_eval'){parent.status=job.status==='cancelled'?'cancelled':'done';parent.evaluationStatus=job.status;parent.finishedAt=new Date().toISOString()}
    save();kick();
  }
  function cancel(id){
    const j=jobs.find(j=>j.id===id);if(!j)throw Error('任务不存在。');
    if(!pending(j))return j;
    if(j.status==='running')controllers.get(j.id)?.abort();
    else{j.status='cancelled';j.finishedAt=new Date().toISOString();if(j.parentId)settleParent(j);onCancel(j)}
    for(const child of jobs.filter(x=>x.parentId===id&&pending(x)))cancel(child.id);
    save();kick();return j;
  }
  function control(id,action){
    const b=batches.find(b=>b.id===id);if(!b)throw Error('批次不存在。');
    if(action==='pause')b.paused=true;
    else if(action==='resume'){if(b.cancelled)throw Error('已取消批次不能继续，可重试未完成项。');b.paused=false}
    else if(action==='cancel'){b.cancelled=true;b.paused=false;for(const j of jobs.filter(j=>j.batch===id&&pending(j)))cancel(j.id)}
    else throw Error('未知批次操作。');
    save();kick();return b;
  }
  function retry(id){
    const b=batches.find(x=>x.id===id);if(!b)throw Error('批次不存在。');
    if(jobs.some(j=>j.batch===id&&pending(j)))throw Error('请等待批次结束或先取消剩余任务。');
    const failed=jobs.filter(j=>j.batch===id&&['error','interrupted','cancelled'].includes(j.status)&&j.operation==='generate'&&!j.parentId);
    const evalFailed=jobs.filter(j=>j.batch===id&&j.operation==='evaluate'&&['error','interrupted','cancelled'].includes(j.status));
    const selected=[...failed.filter(j=>!evalFailed.some(x=>x.parentId===j.id)),...evalFailed];
    if(!selected.length)throw Error('没有失败或中断请求需要重试。');
    const copy={...b,id:crypto.randomUUID(),name:b.name+'·重试',createdAt:new Date().toISOString(),paused:false,cancelled:false,retryOf:b.id};
    if(jobs.filter(pending).length+selected.length>2000)throw Error('等待队列上限2000个请求。');
    batches.unshift(copy);
    for(const j of selected)jobs.push({...j,id:crypto.randomUUID(),batch:copy.id,retryOf:j.id,parentId:undefined,status:'queued',attempt:0,attempts:[],error:undefined,errorCode:undefined,statusCode:undefined,storageError:undefined,startedAt:undefined,finishedAt:undefined,retryAt:undefined,firstTokenMs:undefined,chars:undefined,stage:undefined,resultEvaluation:undefined,recordId:j.operation==='evaluate'?j.recordId:undefined,createdAt:copy.createdAt});
    save();kick();return copy;
  }
  function batchStatus(b){
    const list=jobs.filter(j=>j.batch===b.id&&j.operation!=='thumbnail'),roots=list.filter(j=>!j.parentId),done=roots.filter(j=>!pending(j)).length;
    return {...b,total:roots.length,completed:done,running:list.filter(j=>j.status==='running').length,queued:list.filter(j=>['queued','retry_wait'].includes(j.status)).length,errors:list.filter(j=>j.status==='error'||j.status==='interrupted').length,retryableCount:list.filter(j=>['error','interrupted','cancelled'].includes(j.status)&&(!j.parentId||j.operation==='evaluate')).length,status:b.cancelled?'cancelled':done===roots.length?'done':b.paused?'paused':'running',finishedAt:done===roots.length?roots.map(j=>j.finishedAt||'').sort().at(-1):null};
  }
  timer=setInterval(pump,250);timer.unref();save();
  return {jobs,batches,addBatch,addJob,cancel,control,retry,settleParent,batchStatus,save,kick,pending,setLimits(g,e){const generation=integer(g,1,8,'全局生成并发'),evaluation=integer(e,1,2,'评审并发');maxGenerate=generation;maxEvaluate=evaluation;save();kick()},close(){closed=true;clearInterval(timer);for(const c of controllers.values())c.abort()}};
}
module.exports={createQueue,integer,PENDING};
