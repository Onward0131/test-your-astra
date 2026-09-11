'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Core = require('./core.cjs');
const Player = require('./preview.cjs');
const Visual = require('./visual.cjs');
const Appearance = require('./appearance.cjs');
const Insights = require('./insights.cjs');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch(error) { if(error.code==='ENOENT')return fallback;throw new Error(path.basename(file)+'无法读取，请从备份恢复；原文件未覆盖。'); } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file); }
function previewDocument(source) {
  // Opaque sandbox origin and CSP keep generated code separate from the control API.
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none';";
  const content = String(source).replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><style>html,body{margin:0}a,form{pointer-events:none}</style>' + content;
}
function savedPreview(source) {
  return Player.playerDocument(source, true);
}
function vault(mode, value) {
  if (process.platform !== 'win32') return Promise.reject(new Error('此版本的加密记忆仅支持Windows；其他系统可使用会话密钥。'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.MODEL_PROBE_PWSH || 'pwsh', ['-NoProfile', '-File', path.join(__dirname, 'vault.ps1'), '-Mode', mode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', settled = false;
    const timer = setTimeout(() => { child.kill(); finish(new Error('本机密钥处理超时。')); }, 15000);
    function finish(error) { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(out.trim()); }
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.resume();
    child.on('error', () => finish(new Error('无法启动PowerShell7进行密钥加密。')));
    child.on('exit', code => finish(code === 0 ? null : new Error('密钥无法解密，请重新输入。')));
    child.stdin.on('error', () => {}); child.stdin.end(value);
  });
}
function createRuntime(options) {
  const {runProbe,defaults}=options;
  const Bench=require('./benchmark.cjs'),{createQueue,integer}=require('./queue.cjs');
  const root=options.dataDir||__dirname,stateFile=path.join(root,'settings.json'),recordsFile=path.join(root,'records.json');
  const initial=readJson(fs.existsSync(stateFile)?stateFile:path.join(root,'portable-state.json'),{});
  const profiles=Array.isArray(initial.profiles)?initial.profiles:[{...defaults,id:'default',name:'默认astra',keyOptional:false,encryptedKey:''}];
  if(!profiles.some(p=>p.id==='default'))profiles.unshift({...defaults,id:'default',name:'默认astra',keyOptional:false,encryptedKey:''});
  const schedules=initial.schedules||[],evaluator={enabled:true,profileId:'default',...initial.evaluator};
  const limits={generation:4,evaluation:1,...initial.limits},baselines=initial.baselines||{};
  const appearance={enabled:true,threshold:.32,references:{},...initial.appearance};
  const keys=new Map();if(options.sessionKey)keys.set('default',options.sessionKey);
  let records=readJson(recordsFile,[]),revision=Date.now(),closed=false,ticking=false,storageError='',queue;
  if(!Array.isArray(records))throw Error('记录文件无效。');
  const persist=()=>{revision++;writeJson(stateFile,{version:4,profiles,schedules,evaluator,limits,baselines,appearance})};
  const flush=()=>{revision++;writeJson(recordsFile,records)};
  function findProfile(id='default'){const p=profiles.find(p=>p.id===id);if(!p)throw Error('连接配置不存在。');return p}
  function publicProfile(p){const {encryptedKey,...safe}=p;return {...safe,connected:keys.has(p.id)||p.keyOptional,remembered:!!encryptedKey}}
  const publicProfiles=()=>profiles.map(publicProfile);
  function connected(p){
    if(options.endpointOf(findProfile(p.id).baseUrl)!==options.endpointOf(p.baseUrl))throw Error(p.name+'的接口地址已变更，请用当前配置新建批次。');
    if(!keys.has(p.id)&&!p.keyOptional)throw Error(p.name+'尚未配置Key。');
  }
  function archive(record){
    if(!validId(record.id))record.id=crypto.randomUUID();
    record.profileId||='default';record.profileName||='默认astra';
    if(record.answer&&record.rulesVersion!==Core.VERSION&&record.finishReason!=='length'&&record.finishReason!=='incomplete'&&record.judgment?.status!=='error'){
      record.judgmentHistory||=[];record.judgmentHistory.push({rulesVersion:record.rulesVersion,judgment:record.judgment});
      record.judgment=Core.judge(record.task,record.answer,record.taskSpec);record.rulesVersion=Core.VERSION;
    }
    const artifact=record.judgment?.artifact||(record.task==='pelican'&&record.answer?Core.extractArtifact(record.answer):'');
    if(artifact){
      const folder=path.join(root,'artifacts',record.id);fs.mkdirSync(folder,{recursive:true});
      const original=path.join(folder,'original.html');
      if(!fs.existsSync(original))fs.writeFileSync(original,artifact);
      if(record.playerVersion!==4){
        fs.writeFileSync(path.join(folder,'preview.html'),savedPreview(artifact));
        fs.writeFileSync(path.join(folder,'player.html'),Player.playerDocument(artifact,false));record.playerVersion=4;
      }
      record.artifact={...record.artifact,originalUrl:'/artifacts/'+record.id+'/original.html',previewUrl:'/artifacts/'+record.id+'/preview.html',playerUrl:'/artifacts/'+record.id+'/player.html',savedAt:record.timestamp};
      if(fs.existsSync(path.join(folder,'thumbnail.webp')))record.artifact.thumbnailUrl='/artifacts/'+record.id+'/thumbnail.webp';
      if(record.autoEvaluation)writeJson(path.join(folder,'evaluation.json'),record.autoEvaluation);
    }
    writeJson(path.join(root,'archive',record.id+'.json'),record);return record;
  }
  function update(record){archive(record);flush();return record}
  function insert(record){archive(record);records.unshift(record);flush();return record}
  for(const record of records){
    try{
      if(['evaluating','queued'].includes(record.autoEvaluation?.status))record.autoEvaluation={status:'unavailable',label:'评估已中断',score:null,summary:'服务中断，可重新评估已保存作品。',dimensions:[],issues:[],evaluatedAt:new Date().toISOString()};
      archive(record);
    }catch(error){storageError='部分历史归档写入失败：'+error.message}
  }
  for(const s of schedules){s.running=false;if(s.enabled&&(!s.nextRunAt||Date.parse(s.nextRunAt)<=Date.now()))s.nextRunAt=new Date(Date.now()+s.intervalMinutes*60000).toISOString()}
  const ready=Promise.all(profiles.map(async p=>{if(p.encryptedKey&&!keys.has(p.id))try{keys.set(p.id,await vault('decrypt',p.encryptedKey))}catch{p.keyError='已保存的Key无法解密，请重新连接'}})).then(async()=>{if(await Appearance.hydrate(records,root))flush()});
  function judgeConfig(){
    const p=findProfile(evaluator.profileId),{encryptedKey,...safe}=p;
    return {enabled:evaluator.enabled,profile:safe};
  }
  function signature(b,p){
    return Bench.hash({profile:Bench.profileSignature(p),variant:b.variant,seed:b.variant==='varied'?b.seed:null,tasks:b.tasks,judge:b.evaluator?.enabled?Bench.profileSignature(b.evaluator.profile):'disabled',versions:b.conditionVersion||{rules:Core.VERSION,visual:Visual.VERSION}});
  }
  async function saveProfile(input){
    const previous=input.id?findProfile(input.id):null,id=previous?.id||crypto.randomUUID();
    const profile={id,name:String(input.name||'').trim().slice(0,80),baseUrl:String(input.baseUrl||'').trim(),model:String(input.model||defaults.model).trim(),protocol:input.protocol==='responses'?'responses':'chat',reasoning:String(input.reasoning||''),maxTokens:Number(input.maxTokens||16384),timeout:Number(input.timeout||600),tokenField:input.tokenField==='max_tokens'?'max_tokens':'max_completion_tokens',keyOptional:input.keyOptional===true,encryptedKey:previous?.encryptedKey||''};
    if(!profile.name)throw Error('请填写连接名称。');options.validate({...profile,task:'candy',apiKey:''});
    const key=String(input.apiKey||'').trim();if(/[\r\n]/.test(key)||key.length>4096)throw Error('API Key格式无效。');
    const changed=previous&&(!previous.baseUrl||options.endpointOf(previous.baseUrl)!==options.endpointOf(profile.baseUrl));
    if(changed&&!key&&!profile.keyOptional)throw Error('更换接口地址时请重新输入该接口的Key。');
    if(changed){profile.encryptedKey='';if(queue?.jobs.some(j=>j.profileId===id&&queue.pending(j)))throw Error('该连接仍有任务，请先完成或取消任务后修改地址。')}
    if(key)profile.encryptedKey=input.remember?await vault('encrypt',key):'';
    else if(input.remember===false)profile.encryptedKey='';
    else if(input.remember&&!profile.encryptedKey&&keys.has(id))profile.encryptedKey=await vault('encrypt',keys.get(id));
    if(!profile.keyOptional&&!key&&!keys.has(id)&&!profile.encryptedKey)throw Error('请填写API Key或选择免密接口。');
    if(changed)keys.delete(id);if(key)keys.set(id,key);
    if(previous)profiles[profiles.indexOf(previous)]=profile;else profiles.push(profile);
    persist();return publicProfile(profile);
  }
  function startBatch(input){
    const ids=[...new Set(input.profileIds||[input.profileId||'default'])],selected=ids.map(findProfile);
    selected.forEach(connected);
    const b=queue.addBatch({...input,profiles:selected,evaluator:judgeConfig(),conditionVersion:{rules:Core.VERSION,visual:Visual.VERSION}});return batchReport(b.id);
  }
  function enqueue(profileId,tasks,source='manual',scheduleId=null){
    const b=startBatch({profileIds:[profileId],tasks,rounds:1,concurrency:2,retries:0,source,scheduleId,name:source==='schedule'?'定时双题检测':'单次检测'});
    return queue.jobs.filter(j=>j.batch===b.id&&j.operation==='generate');
  }
  function enqueueAssessment(id,thumbnailOnly=false){
    const record=records.find(r=>r.id===id);if(!record?.artifact)throw Error('该记录没有可评估作品。');
    const pending=queue.jobs.find(j=>j.recordId===id&&queue.pending(j)&&j.operation==='evaluate');
    if(pending)return pending;
    if(thumbnailOnly){
      if(record.artifact.thumbnailUrl)return null;
      const existing=queue.jobs.find(j=>j.recordId===id&&j.operation==='thumbnail'&&queue.pending(j));if(existing)return existing;
      if(queue.jobs.filter(j=>j.operation==='thumbnail'&&queue.pending(j)).length>=36)return null;
    }
    const config=judgeConfig();if(!thumbnailOnly)connected(config.profile);
    if(!thumbnailOnly){record.autoEvaluation={status:'queued',label:'评估排队中',stage:'queued'};update(record)}
    return queue.addJob({operation:thumbnailOnly?'thumbnail':'evaluate',recordId:id,task:'pelican',profileId:record.profileId,profileName:record.profileName,model:record.model,evaluator:config,source:thumbnailOnly?'thumbnail':'assessment'});
  }
  async function assess(record,job,signal,config,thumbnailOnly){
    const folder=path.join(root,'artifacts',record.id);
    if(!thumbnailOnly){record.autoEvaluation={status:'evaluating',label:'自动评估中',stage:'rendering',startedAt:new Date().toISOString()};update(record)}
    let capture=record.renderEvidence;
    if(thumbnailOnly&&record.artifact.thumbnailUrl)return;
    const reuse=!thumbnailOnly&&capture?.frames?.length===3&&capture.version===Visual.VERSION&&capture.frames.every(name=>fs.existsSync(path.join(folder,name)));
    if(!reuse){
      signal.throwIfAborted();
      capture=await Visual.captureArtifact(record.judgment?.artifact||fs.readFileSync(path.join(folder,'original.html'),'utf8'),folder,!thumbnailOnly,signal);
      if(thumbnailOnly&&record.renderEvidence?.frames?.length===3)return;
      record.renderEvidence=capture;delete record.thumbnailError;
      record.artifact.thumbnailUrl='/artifacts/'+record.id+'/thumbnail.webp';
      record.artifact.frameUrls=capture.frames.map(name=>'/artifacts/'+record.id+'/'+name);update(record);
    }
    if(record.appearanceFingerprint?.version!==Appearance.VERSION&&fs.existsSync(path.join(folder,'thumbnail.webp')))try{record.appearanceFingerprint=await Appearance.fingerprint(path.join(folder,'thumbnail.webp'));update(record)}catch{}
    if(thumbnailOnly)return;
    if(!capture.nonBlank||capture.hasMotion===false||capture.errors?.length){
      const issues=[...(!capture.nonBlank?['未检测到有效SVG画面']:[]),...(capture.hasMotion===false?['三帧中未检测到足够运动']:[]),...(capture.errors?.length?['脚本运行报错']:[])];
      record.autoEvaluation={status:'fail',label:'运行检测未通过',score:0,confidence:1,summary:issues.join('；')+'。未调用图像评审。',issues,dimensions:[],evaluatedAt:new Date().toISOString(),method:'本地运行检测'};
    }else{
      job.stage='vision';record.autoEvaluation.stage='vision';queue.save();flush();
      const p=config.profile;connected(p);
      record.autoEvaluation=await Visual.evaluateVision(record,capture,folder,p,keys.get(p.id)||'',signal,options);
    }
    if(['length','incomplete'].includes(record.finishReason)&&record.autoEvaluation.status==='pass'){
      record.autoEvaluation.status='uncertain';record.autoEvaluation.label='回答被截断，评估不确定';
      record.autoEvaluation.summary='接口报告输出被截断，画面评分保留，本次不计为通过。'+record.autoEvaluation.summary;
    }
    update(record);
  }
  async function execute(job,signal,batch){
    await ready;
    if(job.operation==='generate'){
      const profile=batch.profiles.find(p=>p.id===job.profileId);connected(profile);
      const spec=Bench.taskSpec(job.task,batch.variant,batch.seed+':'+job.round);
      let progressAt=0;
      const record=await runProbe({...profile,task:job.task,apiKey:keys.get(profile.id)||'',taskSpec:spec,onProgress(data){Object.assign(job,data);if(Date.now()-progressAt>700){revision++;progressAt=Date.now()}}},signal);
      signal.throwIfAborted();
      Object.assign(record,{profileId:profile.id,profileName:profile.name,source:job.source,scheduleId:job.scheduleId,jobId:job.id,batchId:batch.id,round:job.round,attempt:job.attempt,attempts:job.attempts,configSignature:signature(batch,profile),profileSnapshot:profile,taskSpec:spec});
      insert(record);job.recordId=record.id;
      if(record.task==='pelican'&&['length','incomplete'].includes(record.finishReason)){
        record.autoEvaluation={status:'uncertain',label:'回答被截断，评估不确定',score:null,summary:'接口报告输出被截断，已保存现有内容。调整输出上限后可复测，本次未调用图像评审。',dimensions:[],issues:[],evaluatedAt:new Date().toISOString()};update(record);
      }else if(record.task==='pelican'&&record.artifact&&batch.evaluator.enabled){
        record.autoEvaluation={status:'queued',label:'评估排队中',stage:'queued'};update(record);job.status='waiting_eval';
        queue.addJob({operation:'evaluate',batch:batch.id,parentId:job.id,round:job.round,recordId:record.id,task:'pelican',profileId:job.profileId,profileName:job.profileName,model:job.model,source:job.source,scheduleId:job.scheduleId});
      }else if(record.task==='pelican'&&!record.artifact){
        record.autoEvaluation={status:'fail',label:'未生成有效作品',score:0,confidence:1,summary:'回答中没有可运行的HTML或SVG。',dimensions:[],issues:[],evaluatedAt:new Date().toISOString()};update(record);
      }
      if(record.task==='pelican'&&job.status!=='waiting_eval')job.resultEvaluation=structuredClone(record.autoEvaluation||{status:'unavailable',label:'本批次未启用自动评估',score:null});
    }else{
      const record=records.find(r=>r.id===job.recordId);if(!record)throw Error('记录不存在。');
      await assess(record,job,signal,batch?.evaluator||job.evaluator,job.operation==='thumbnail');
      if(job.operation==='evaluate')job.resultEvaluation=structuredClone(record.autoEvaluation);
    }
  }
  function finishSchedule(job){
    if(!job.scheduleId||queue.jobs.some(j=>j.scheduleId===job.scheduleId&&queue.pending(j)))return;
    const s=schedules.find(s=>s.id===job.scheduleId);if(!s)return;
    s.running=false;s.lastFinishedAt=new Date().toISOString();s.lastStatus=queue.jobs.some(j=>j.batch===job.batch&&['error','interrupted'].includes(j.status))?'error':'done';persist();
  }
  function onCancel(job){
    if(job.operation==='evaluate'){
      const record=records.find(r=>r.id===job.recordId);if(record){record.autoEvaluation={status:'unavailable',label:'评估已取消',score:null,summary:'作品已保存，可重新评估。',dimensions:[],issues:[],evaluatedAt:new Date().toISOString()};job.resultEvaluation=structuredClone(record.autoEvaluation);update(record)}
    }
    finishSchedule(job);
  }
  async function onFinished(job){
    if(['error','cancelled'].includes(job.status)){
      if(job.operation==='generate'&&!job.recordId){
        const b=queue.batches.find(b=>b.id===job.batch),p=b?.profiles.find(p=>p.id===job.profileId);
        const record={id:crypto.randomUUID(),timestamp:new Date().toISOString(),task:job.task,model:job.model,profileId:job.profileId,profileName:job.profileName,source:job.source,scheduleId:job.scheduleId,jobId:job.id,batchId:job.batch,round:job.round,cancelled:job.status==='cancelled',attempt:job.attempt,attempts:job.attempts,elapsedMs:Date.now()-Date.parse(job.startedAt),answer:'',rulesVersion:Core.VERSION,configSignature:b&&p?signature(b,p):null,judgment:{task:job.task,status:'error',label:job.status==='cancelled'?'已取消':'请求失败',summary:job.error||'请求未完成',checks:[]}};
        insert(record);job.recordId=record.id;
      }else if(job.operation==='evaluate'){
        const record=records.find(r=>r.id===job.recordId);
        if(record){record.autoEvaluation={status:'unavailable',label:job.status==='cancelled'?'评估已取消':'评估未完成',score:null,summary:job.error,dimensions:[],issues:[],evaluatedAt:new Date().toISOString()};job.resultEvaluation=structuredClone(record.autoEvaluation);update(record)}
      }else if(job.operation==='thumbnail'){
        const record=records.find(r=>r.id===job.recordId);if(record){record.thumbnailError=job.error;update(record)}
      }
    }
    if(job.parentId)queue.settleParent(job);finishSchedule(job);
  }
  queue=createQueue({file:path.join(root,'queue.json'),execute,onFinished,onCancel,onChange(){revision++},maxGenerate:limits.generation,maxEvaluate:limits.evaluation});
  // Preserve the assessment at interruption before a later retry changes the record.
  for(const job of queue.jobs)if(job.operation==='evaluate'&&!queue.pending(job)&&!job.resultEvaluation){
    const record=records.find(r=>r.id===job.recordId);
    if(record)job.resultEvaluation=structuredClone(record.autoEvaluation||{status:'unavailable',label:'评估已中断',score:null,summary:'当次评估未完成，作品已保留。'});
  }
  queue.save();
  function saveSchedule(input){
    const previous=input.id?schedules.find(s=>s.id===input.id):null;if(input.id&&!previous)throw Error('计划不存在。');
    const profile=findProfile(input.profileId||'default'),intervalMinutes=Number(input.intervalMinutes);
    if(!Number.isFinite(intervalMinutes)||intervalMinutes<1||intervalMinutes>10080)throw Error('间隔须为1～10080分钟。');
    const tasks=[...new Set(input.tasks||[])];if(!tasks.length||tasks.some(t=>!['candy','pelican'].includes(t)))throw Error('至少选择一道题。');
    const rounds=integer(input.rounds??previous?.rounds??1,1,100,'轮数'),concurrency=integer(input.concurrency??previous?.concurrency??2,1,8,'并发数');
    if(input.enabled)connected(profile);
    const s={...previous,id:previous?.id||crypto.randomUUID(),name:String(input.name||'定时双题检测').slice(0,80),profileId:profile.id,tasks,intervalMinutes,rounds,concurrency,variant:input.variant||previous?.variant||'fixed',enabled:input.enabled===true,running:previous?.running||false,nextRunAt:input.enabled?new Date(Date.now()+intervalMinutes*60000).toISOString():null};
    if(previous)schedules[schedules.indexOf(previous)]=s;else schedules.push(s);persist();return s;
  }
  function runSchedule(id){
    const s=schedules.find(s=>s.id===id);if(!s)throw Error('计划不存在。');
    if(queue.jobs.some(j=>j.scheduleId===id&&queue.pending(j)))throw Error('该计划仍有未完成批次，不会重复启动。');
    const batch=startBatch({profileIds:[s.profileId],tasks:s.tasks,rounds:s.rounds||1,concurrency:s.concurrency||2,variant:s.variant||'fixed',source:'schedule',scheduleId:id,name:s.name});
    s.running=true;s.lastBatchId=batch.id;s.lastRunAt=new Date().toISOString();if(s.enabled)s.nextRunAt=new Date(Date.now()+s.intervalMinutes*60000).toISOString();persist();return queue.jobs.filter(j=>j.batch===batch.id);
  }
  async function tick(now=Date.now()){
    if(closed||ticking)return;ticking=true;
    try{await ready;for(const s of schedules){
      if(!s.enabled||!s.nextRunAt||Date.parse(s.nextRunAt)>now)continue;
      if(queue.jobs.some(j=>j.scheduleId===s.id&&queue.pending(j))){s.nextRunAt=new Date(now+s.intervalMinutes*60000).toISOString();persist();continue}
      try{runSchedule(s.id);s.lastError=null}catch(error){s.lastError=error.message;s.nextRunAt=new Date(now+s.intervalMinutes*60000).toISOString();persist()}
    }}finally{ticking=false}
  }
  function batchRecords(id){
    const ids=new Set(queue.jobs.filter(j=>j.batch===id).map(j=>j.recordId).filter(Boolean));
    return records.filter(r=>r.batchId===id||ids.has(r.id)).map(r=>{
      const assessment=queue.jobs.find(j=>j.batch===id&&j.recordId===r.id&&j.resultEvaluation);
      const result={...r};if(assessment)result.autoEvaluation=assessment.resultEvaluation;
      if(r.answer&&r.task==='candy'&&!['length','incomplete'].includes(r.finishReason)&&r.judgment?.status!=='error')result.judgment=Core.judge(r.task,r.answer,r.taskSpec);
      return result;
    });
  }
  function batchReport(id){
    const b=queue.batches.find(b=>b.id===id);if(!b)throw Error('批次不存在。');
    const list=batchRecords(id);
    const stats=b.profiles.map(p=>{
      const own=list.filter(r=>r.profileId===p.id),summary=Bench.summarize(own),base=baselines[p.id];
      const requests=queue.jobs.filter(j=>j.batch===id&&j.profileId===p.id);
      for(const task of ['candy','pelican']){
        const missingErrors=requests.filter(j=>j.operation==='generate'&&j.task===task&&!j.recordId&&['error','interrupted'].includes(j.status)).length;
        const missingCancelled=requests.filter(j=>j.operation==='generate'&&j.task===task&&!j.recordId&&j.status==='cancelled').length;
        summary[task].errors+=missingErrors;summary[task].cancelled+=missingCancelled;summary[task].total+=missingErrors+missingCancelled;
        summary[task].evaluationErrors=requests.filter(j=>j.operation==='evaluate'&&j.task===task&&['error','interrupted','cancelled'].includes(j.status)).length;
      }
      const scoredBatch={...b,conditionVersion:{...b.conditionVersion,rules:Core.VERSION}},sig=signature(scoredBatch,p);
      const previous=queue.batches.find(x=>x.id!==id&&Date.parse(x.createdAt)<Date.parse(b.createdAt)&&queue.batchStatus(x).status==='done'&&x.profiles.some(v=>v.id===p.id&&Bench.profileSignature(v)===Bench.profileSignature(p))&&x.tasks.includes('pelican'));
      const manual=records.find(r=>r.id===appearance.references[p.id]&&r.profileId===p.id);
      const referenceBatch=base?.batchId&&base.batchId!==id?queue.batches.find(x=>x.id===base.batchId):previous;
      const referenceRecords=referenceBatch?batchRecords(referenceBatch.id).filter(r=>r.profileId===p.id&&r.task==='pelican'):[];
      const referenceInfo=referenceBatch?{type:base?.batchId===referenceBatch.id?'baseline':'previous',name:referenceBatch.name,batchId:referenceBatch.id}:null;
      const insight=Insights.describe(own,referenceRecords,referenceInfo,appearance,manual?[manual]:referenceRecords);
      insight.appearance.referenceName=manual?'手动指定的画风参考':referenceInfo?'参考批次：'+referenceInfo.name:'尚无历史参考';
      return {profileId:p.id,profileName:p.name,model:p.model,summary,insight,comparison:Bench.compare(summary,base?.summary,base?.signature===sig,b.tasks),baseline:base?{name:base.name,createdAt:base.createdAt,batchId:base.batchId,summary:base.summary}:null,signature:sig};
    });
    return {...queue.batchStatus(b),scoringRulesVersion:Core.VERSION,stats,records:list.map(r=>r.id),results:list.map(compact),requests:queue.jobs.filter(j=>j.batch===id&&j.operation!=='thumbnail').map(({resultEvaluation,evaluator,...job})=>job)};
  }
  function repeatBatch(id){
    const b=queue.batches.find(x=>x.id===id);if(!b)throw Error('批次不存在。');
    b.profiles.forEach(connected);if(b.evaluator?.enabled)connected(b.evaluator.profile);
    const copy=queue.addBatch({...b,id:undefined,name:b.name+'·复测',scheduleId:null,source:'manual',conditionVersion:{rules:Core.VERSION,visual:Visual.VERSION}});
    return batchReport(copy.id);
  }
  function setBaseline(id,profileId){
    const report=batchReport(id);if(report.status!=='done')throw Error('请在批次完成后设置基线。');
    const stats=report.stats.find(s=>s.profileId===profileId);if(!stats)throw Error('此批次没有该连接。');
    if(stats.summary.candy.judged+stats.summary.pelican.judged===0)throw Error('该批次没有有效判定。');
    baselines[profileId]={batchId:id,name:report.name,signature:stats.signature,summary:stats.summary,createdAt:new Date().toISOString()};persist();return baselines[profileId];
  }
  function compact(r){return {id:r.id,task:r.task,timestamp:r.timestamp,model:r.model,returnedModel:r.returnedModel,profileId:r.profileId,profileName:r.profileName,source:r.source,jobId:r.jobId,batchId:r.batchId,round:r.round,cancelled:r.cancelled,thumbnailError:r.thumbnailError,elapsedMs:r.elapsedMs,firstTokenMs:r.firstTokenMs,usage:r.usage,judgment:{status:r.judgment?.status,label:r.judgment?.label,summary:r.judgment?.summary},artifact:r.artifact,taskSpec:r.taskSpec?{variant:r.taskSpec.variant,expected:r.taskSpec.expected,counts:r.taskSpec.counts}:null,autoEvaluation:r.autoEvaluation?{status:r.autoEvaluation.status,label:r.autoEvaluation.label,score:r.autoEvaluation.score,summary:r.autoEvaluation.summary,stage:r.autoEvaluation.stage,evaluatedAt:r.autoEvaluation.evaluatedAt}:null,renderEvidence:r.renderEvidence?{hasMotion:r.renderEvidence.hasMotion,nonBlank:r.renderEvidence.nonBlank,errors:r.renderEvidence.errors}:null}}
  const snapshots=(small=false)=>({version:4,release:'4.1.0',revision,evaluator,limits,baselines,appearance,profiles:publicProfiles(),schedules,jobs:queue.jobs.filter(j=>queue.pending(j)).concat(queue.jobs.filter(j=>!queue.pending(j)).slice(-150)),batches:queue.batches.slice(0,100).map(b=>queue.batchStatus(b)),records:small?records.map(compact):records,storageError,serverTime:new Date().toISOString(),backgroundRunning:true});
  const timer=setInterval(()=>tick().catch(error=>{storageError=error.message}),options.tickMs||1000);timer.unref();
  try{persist();flush()}catch(error){storageError=error.message}
  return {ready,snapshots,publicProfiles,saveProfile,saveSchedule,runSchedule,enqueue,enqueueAssessment,startBatch,batchReport,repeatBatch,setBaseline,controlBatch:queue.control,retryBatch:queue.retry,cancelJob:queue.cancel,tick,profiles,schedules,records:()=>records,jobs:queue.jobs,root,previewDocument,
    saveLimits(input){queue.setLimits(input.generation,input.evaluation);limits.generation=Number(input.generation);limits.evaluation=Number(input.evaluation);persist();return limits},
    saveAppearance(input){
      const threshold=input.threshold===undefined?appearance.threshold:Number(input.threshold);
      if(!Number.isFinite(threshold)||threshold<.1||threshold>.9)throw Error('画面差异阈值须为10～90。');
      if(input.recordId){const r=records.find(r=>r.id===input.recordId&&r.profileId===input.profileId&&r.task==='pelican'&&r.artifact);if(!r)throw Error('请选择该连接的已保存作品。');appearance.references[input.profileId]=r.id}
      else if(input.recordId===null&&input.profileId)delete appearance.references[input.profileId];
      appearance.threshold=threshold;if(input.enabled!==undefined)appearance.enabled=input.enabled===true;persist();return appearance;
    },
    saveEvaluator(input){findProfile(input.profileId);evaluator.profileId=input.profileId;evaluator.enabled=input.enabled!==false;persist();return evaluator},
    async connect(key,remember=false){return saveProfile({...findProfile(),apiKey:key,remember})},
    saveManual(id,manual){const record=records.find(r=>r.id===id);if(!record)throw Error('记录不存在。');record.manual={bird:manual.bird===true,bike:manual.bike===true,motion:manual.motion===true,source:'human',timestamp:new Date().toISOString()};record.manual.label=record.manual.bird&&record.manual.bike&&record.manual.motion?'三项均符合':'部分或全部未符合';return update(record)},
    savePasted(task,answer){if(!['candy','pelican'].includes(task)||!String(answer).trim()||String(answer).length>2000000)throw Error('请提供有效回答，最多200万字。');const r=insert({id:crypto.randomUUID(),timestamp:new Date().toISOString(),task,model:'粘贴的回答',profileId:'paste',profileName:'离线粘贴',source:'paste',elapsedMs:0,answer:String(answer),judgment:Core.judge(task,answer),rulesVersion:Core.VERSION});if(task==='pelican'&&r.artifact&&evaluator.enabled)try{enqueueAssessment(r.id)}catch(error){r.autoEvaluation={status:'unavailable',label:'作品已保存，评估未启动',score:null,summary:error.message,dimensions:[],issues:[],evaluatedAt:new Date().toISOString()};update(r)}return r},
    close(){closed=true;clearInterval(timer);queue.close()}
  };
}

function serve(port, options) {
  const runtime = createRuntime(options);
  let origin = 'http://127.0.0.1:' + port;
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== '127.0.0.1:' + port) return send(403, { error: 'Invalid host' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/' || req.url === '/tool.html') { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); return fs.createReadStream(path.join(__dirname, 'tool.html')).pipe(res); }
    const artifact = /^\/artifacts\/([a-zA-Z0-9_-]{1,100})\/(original\.html|preview\.html|player\.html|thumbnail\.webp|frame-[012]\.png|evaluation\.json)$/.exec(req.url);
    if (req.method === 'GET' && artifact) {
      const file = path.join(runtime.root, 'artifacts', artifact[1], artifact[2]);
      if (!fs.existsSync(file)) return send(404, { error: '作品文件不存在。' });
      res.setHeader('Content-Type', artifact[2].endsWith('.png')?'image/png':artifact[2].endsWith('.webp')?'image/webp':artifact[2].endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8');
      if (artifact[2] === 'original.html') res.setHeader('Content-Disposition', 'attachment; filename=pelican-' + artifact[1] + '.html');
      return fs.createReadStream(file).pipe(res);
    }
    if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (!req.url.startsWith('/api/')) return send(404, { error: 'Not found' });
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return send(403, { error: 'Origin rejected' });
    await runtime.ready;
    if (req.method === 'GET') {
      const requestUrl=new URL(req.url,origin);
      if(requestUrl.pathname==='/api/dashboard'){
        const snapshot=runtime.snapshots(true);
        if(String(snapshot.revision)===requestUrl.searchParams.get('since'))return send(200,{unchanged:true,revision:snapshot.revision,serverTime:snapshot.serverTime});
        return send(200,snapshot);
      }
      const batch=/^\/api\/batches\/([a-zA-Z0-9_-]{1,100})$/.exec(requestUrl.pathname);
      if(batch){try{return send(200,runtime.batchReport(batch[1]))}catch(error){return send(404,{error:error.message})}}
      const snapshot = runtime.snapshots();
      if (req.url === '/api/state') return send(200, snapshot);
      const detail = /^\/api\/records\/([a-zA-Z0-9_-]{1,100})$/.exec(req.url);
      if(detail){const record=runtime.records().find(r=>r.id===detail[1]);return send(record?200:404,record||{error:'记录不存在。'});}
      if (req.url === '/api/config') return send(200, { ...snapshot.profiles.find(p => p.id === 'default'), version: 4 });
      if (req.url === '/api/records') return send(200, snapshot.records);
      return send(404, { error: 'Not found' });
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(403, { error: 'Origin rejected' });
    try {
      const parts = []; let size = 0; for await (const part of req) { size += part.length; if (size > 8 * 1024 * 1024) throw new Error('请求内容过大。'); parts.push(part); }
      const input = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (req.url === '/api/profiles') return send(200, await runtime.saveProfile(input));
      if (req.url === '/api/batches') return send(202,runtime.startBatch(input));
      if (req.url === '/api/batches/control') return send(200,runtime.controlBatch(input.id,input.action));
      if (req.url === '/api/batches/retry') return send(202,runtime.retryBatch(input.id));
      if (req.url === '/api/batches/repeat') return send(202,runtime.repeatBatch(input.id));
      if (req.url === '/api/baselines') return send(200,runtime.setBaseline(input.batchId,input.profileId));
      if (req.url === '/api/limits') return send(200,runtime.saveLimits(input));
      if (req.url === '/api/appearance') return send(200,runtime.saveAppearance(input));
      if (req.url === '/api/connect') return send(200, await runtime.connect(input.apiKey, input.remember));
      if (req.url === '/api/jobs' || req.url === '/api/run') return send(202, { jobs: runtime.enqueue(input.profileId || 'default', input.tasks || [input.task]) });
      if (req.url === '/api/jobs/cancel') return send(200, runtime.cancelJob(input.id));
      if (req.url === '/api/schedules') return send(200, runtime.saveSchedule(input));
      if (req.url === '/api/schedules/run') return send(202, { jobs: runtime.runSchedule(input.id) });
      if (req.url === '/api/review') return send(200, runtime.saveManual(input.id, input.manual || {}));
      if (req.url === '/api/evaluate') return send(202, {job:runtime.enqueueAssessment(input.id)});
      if (req.url === '/api/thumbnails') { const ids=Array.isArray(input.ids)?input.ids.slice(0,12):[];return send(202,{jobs:ids.map(id=>runtime.enqueueAssessment(id,true)).filter(Boolean)}); }
      if (req.url === '/api/evaluator') return send(200,runtime.saveEvaluator(input));
      if (req.url === '/api/paste') return send(200, runtime.savePasted(input.task, input.answer));
      return send(404, { error: 'Not found' });
    } catch (error) { return send(400, { error: error instanceof SyntaxError ? 'JSON格式不正确。' : error.message }); }
  });
  server.requestTimeout = 30000;
  server.listen(port, '127.0.0.1', () => { port=server.address().port;origin='http://127.0.0.1:'+port;console.log('Model Probe 4.1已启动：'+origin); });
  server.on('close', () => runtime.close());
  server.on('error', error => { runtime.close(); console.error(error.code === 'EADDRINUSE' ? '端口已占用，请打开现有工具。' : error.message); });
  server.runtime = runtime; return server;
}
module.exports = { createRuntime, serve, previewDocument, savedPreview };
