'use strict';
const crypto=require('node:crypto');
const Core=require('./core.cjs');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex').slice(0,20);
const VERSION='benchmark-1.0';
function solveCandy(counts){
  const [a,p,w]=counts[0],[s,t,v]=counts[1];
  const failures=[[w,s+t+v],[a+w,s+v],[p+w,t+v],[a+p+w,v]];
  const strategies=[];
  let minimum=Infinity;
  for(let r=0;r<=a+p+w;r++)for(let star=0;star<=s+t+v;star++){
    if(failures.some(([x,y])=>r<=x&&star<=y))continue;
    if(r+star<minimum){minimum=r+star;strategies.length=0}
    if(r+star===minimum)strategies.push({round:r,star});
  }
  return {minimum,strategies,failures};
}
function taskSpec(task,variant='fixed',seed=''){
  if(task==='pelican')return {task,variant:'fixed',prompt:Core.prompts.pelican,promptHash:hash(Core.prompts.pelican)};
  let counts=[[7,9,8],[7,6,4]];
  if(variant==='varied'){
    const digest=crypto.createHash('sha256').update(String(seed)).digest();
    counts=counts.map((row,i)=>row.map((x,j)=>Math.max(1,x+(digest[i*3+j]%7)-3)));
  }
  const solution=solveCandy(counts);
  const prompt=variant==='fixed'?Core.prompts.candy:Core.prompts.candy.replace('| 圆形 | 7 | 9 | 8 |', '| 圆形 | '+counts[0].join(' | ')+' |').replace('| 五角星形 | 7 | 6 | 4 |','| 五角星形 | '+counts[1].join(' | ')+' |');
  return {task,variant,seed:variant==='varied'?String(seed):null,counts,expected:solution.minimum,strategies:solution.strategies,failures:solution.failures,prompt,promptHash:hash(prompt)};
}
function profileSignature(p){return hash({baseUrl:p.baseUrl,model:p.model,reasoning:p.reasoning||'',protocol:p.protocol,maxTokens:p.maxTokens,tokenField:p.tokenField});}
function summarize(records){
  const rows=records.filter(r=>r.task==='candy'||r.task==='pelican');
  const mean=arr=>arr.length?arr.reduce((s,x)=>s+x,0)/arr.length:null;
  const median=arr=>{if(!arr.length)return null;arr=[...arr].sort((a,b)=>a-b);return arr.length%2?arr[(arr.length-1)/2]:(arr[arr.length/2-1]+arr[arr.length/2])/2};
  const result={};
  for(const task of ['candy','pelican']){
    const list=rows.filter(r=>r.task===task),good=list.filter(r=>r.judgment?.status!=='error'&&!r.cancelled),scored=good.filter(r=>task==='candy'?['pass','fail'].includes(r.judgment.status):['pass','fail'].includes(r.autoEvaluation?.status));
    const pass=scored.filter(r=>(task==='candy'?r.judgment.status:r.autoEvaluation.status)==='pass').length;
    const scores=scored.map(r=>r.autoEvaluation?.score).filter(Number.isFinite);
    const returned=[...new Set(good.map(r=>r.returnedModel).filter(Boolean))];
    result[task]={total:list.length,outputs:good.length,errors:list.filter(r=>r.judgment?.status==='error'&&!r.cancelled).length,cancelled:list.filter(r=>r.cancelled).length,judged:scored.length,pass,fail:scored.length-pass,unknown:good.length-scored.length,passRate:scored.length?pass/scored.length:null,coverage:good.length?scored.length/good.length:null,ci:wilson(pass,scored.length),meanScore:mean(scores),medianMs:median(good.map(r=>r.elapsedMs).filter(Number.isFinite)),medianFirstTokenMs:median(good.map(r=>r.firstTokenMs).filter(Number.isFinite)),returnedModels:returned,reportedModelMismatch:good.filter(r=>r.returnedModel&&r.returnedModel!==r.model).length,usage:good.reduce((n,r)=>n+(Number(r.usage?.total_tokens)||Number(r.usage?.input_tokens||0)+Number(r.usage?.output_tokens||0)),0),evaluationTokens:good.reduce((n,r)=>n+(Number(r.autoEvaluation?.usage?.total_tokens)||Number(r.autoEvaluation?.usage?.input_tokens||0)+Number(r.autoEvaluation?.usage?.output_tokens||0)),0)};
  }
  return result;
}
function wilson(k,n){
  if(!n)return null;const z=1.959963984540054,p=k/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,delta=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [Math.max(0,center-delta),Math.min(1,center+delta)];
}
function compare(current,baseline,comparable=true,tasks=['candy','pelican']){
  if(!baseline)return {status:'no_baseline',label:'尚未设置基线',notes:['先将一次可信批次设为基线，再观察同条件下的变化。']};
  if(!comparable)return {status:'conditions_changed',label:'测试条件已变化',notes:['题目模式、模型参数或评审设置与基线不同，分差不能直接归因于模型退化。']};
  const notes=[];let severe=false,warning=false,enough=false;
  for(const task of tasks){
    const a=current[task],b=baseline[task],name=task==='candy'?'糖果':'鹈鹕';
    if(a.errors){warning=true;notes.push(name+'有'+a.errors+'次请求失败，需与内容质量分别判断。')}
    if(a.unknown>0&&a.coverage<0.8){warning=true;notes.push(name+'判定覆盖率不足80%，当前结果不完整。')}
    if(a.judged<5||b.judged<5){notes.push(name+'有效判定不足5份，暂不下质量结论。');continue}
    enough=true;
    if(a.passRate+0.15<b.passRate){warning=true;notes.push(name+'通过率比基线下降'+Math.round((b.passRate-a.passRate)*100)+'个百分点。');if(a.ci[1]<b.ci[0])severe=true}
    if(task==='pelican'&&a.meanScore!==null&&b.meanScore!==null&&a.meanScore<=b.meanScore-10){warning=true;notes.push('鹈鹕平均分下降'+(b.meanScore-a.meanScore).toFixed(1)+'分。')}
    if(a.unknown)notes.push(name+'另有'+a.unknown+'份判定未完成，不能计为通过。');
    if(a.medianMs&&b.medianMs&&a.medianMs>b.medianMs*2)notes.push(name+'响应耗时超过基线2倍，速度变化不单独认定为质量下降。');
  }
  return {status:severe?'regression':warning?'watch':enough?'stable':'insufficient',label:severe?'检测到明显质量下降':warning?'存在异常信号':enough?'未发现明显质量下降':'样本不足',notes};
}
module.exports={VERSION,hash,solveCandy,taskSpec,profileSignature,summarize,wilson,compare};
