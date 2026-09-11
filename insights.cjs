'use strict';
const Appearance=require('./appearance.cjs');
const dims=[['pelican','鹈鹕辨识',25],['bicycle','自行车结构',20],['riding','骑行动作',30],['coherence','运动协调',15],['composition','画面完成度',10]];
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const visible=r=>({id:r.id,round:r.round,profileName:r.profileName,thumbnailUrl:r.artifact?.thumbnailUrl,score:r.autoEvaluation?.score??null,label:r.autoEvaluation?.label});
function describe(records,refs=[],referenceInfo=null,appearanceSettings={},styleRefs=refs){
  const current=records.filter(r=>r.task==='pelican'&&!r.cancelled&&r.judgment?.status!=='error'),previous=refs.filter(r=>r.task==='pelican');
  const scored=list=>list.filter(r=>Number.isFinite(r.autoEvaluation?.score)&&['pass','fail'].includes(r.autoEvaluation?.status));
  const active=scored(current),old=scored(previous),average=mean(active.map(r=>r.autoEvaluation.score)),referenceMean=mean(old.map(r=>r.autoEvaluation.score));
  const conditions=rows=>[...new Set(rows.map(r=>JSON.stringify([r.autoEvaluation?.version||'local',r.autoEvaluation?.judgeModel||'',r.autoEvaluation?.judgeProvider||''])))];
  const comparable=active.length>0&&old.length>0&&JSON.stringify(conditions(active).sort())===JSON.stringify(conditions(old).sort());
  const breakdown=dims.map(([key,label,max])=>{
    const values=list=>list.map(r=>r.autoEvaluation?.dimensions?.find(d=>d.key===key)?.score).filter(Number.isFinite);
    const score=mean(values(active)),prior=mean(values(old));
    return {key,label,max,mean:score,priorMean:prior,delta:score!==null&&prior!==null?score-prior:null,deducted:score===null?null:max-score,n:values(active).length};
  });
  const weakest=breakdown.filter(d=>d.mean!==null).sort((a,b)=>(b.deducted/b.max)-(a.deducted/a.max)).slice(0,2);
  const appearance=appearanceSettings.enabled===false?{changed:0,compared:0,rows:[],disabled:true}:Appearance.compare(current,styleRefs,appearanceSettings.threshold??.32);
  const delta=average!==null&&referenceMean!==null?average-referenceMean:null;
  return {average,referenceMean,delta,comparable,reference:referenceInfo,scoreCount:active.length,unscored:current.length-active.length,range:active.length?[Math.min(...active.map(r=>r.autoEvaluation.score)),Math.max(...active.map(r=>r.autoEvaluation.score))]:null,dimensions:breakdown,mainDeductions:weakest,
    explanation:weakest.length?'主要扣分：'+weakest.map(d=>d.label+'平均扣'+d.deducted.toFixed(1)+'分').join('；')+'。':'尚无完整分项评分。',
    caveat:!comparable&&old.length?'前后评审版本或评审连接不同，分差只作描述，不能直接认定为能力变化。':active.length<5||old.length<5?'有效样本不足5份，暂不判定质量升降。':'评分包含评审波动，应结合多轮和具体证据判断。',
    appearance,worst:active.length?visible([...active].sort((a,b)=>a.autoEvaluation.score-b.autoEvaluation.score)[0]):null,
    references:previous.filter(r=>r.artifact?.thumbnailUrl).slice(0,6).map(visible),
    examples:current.slice(0,12).map(r=>({...visible(r),issues:r.autoEvaluation?.issues?.slice(0,3)||[],summary:r.autoEvaluation?.summary||'',status:r.autoEvaluation?.status||'unavailable'}))};
}
module.exports={describe};
