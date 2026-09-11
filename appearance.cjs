'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const VERSION='appearance-1.0';
async function fingerprint(file){
  const sharp=require('sharp'),bytes=fs.readFileSync(file),imageHash=crypto.createHash('sha256').update(bytes).digest('hex');
  const {data,info}=await sharp(bytes).resize(96,64,{fit:'fill'}).flatten({background:'#fff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const palette=Array(28).fill(0),layout=Array(96).fill(0),edges=Array(96).fill(0),counts=Array(96).fill(0),lum=[];
  for(let y=0;y<64;y++)for(let x=0;x<96;x++){
    const i=(y*96+x)*info.channels,r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,s=max?d/max:0,l=(r+g+b)/3;
    let hue=0;if(d){hue=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;}
    const bucket=s<.17?24+Math.min(3,Math.floor(l*4)):Math.min(7,Math.floor(hue/6*8))*3+Math.min(2,Math.floor(l*3));
    palette[bucket]++;const block=Math.floor(y/8)*12+Math.floor(x/8);layout[block]+=l;counts[block]++;lum[y*96+x]=l;
    if(x&&y)edges[block]+=Math.min(1,(Math.abs(l-lum[y*96+x-1])+Math.abs(l-lum[(y-1)*96+x]))*2);
  }
  const q=n=>Math.round(n*10000)/10000;
  return {version:VERSION,imageHash,palette:palette.map(n=>q(n/6144)),layout:layout.map((n,i)=>q(n/counts[i])),edges:edges.map((n,i)=>q(n/counts[i]))};
}
function distance(a,b){
  if(!a||!b||a.version!==VERSION||b.version!==VERSION)return null;
  const palette=Math.sqrt(a.palette.reduce((n,x,i)=>n+(Math.sqrt(x)-Math.sqrt(b.palette[i]))**2,0)/2);
  const diff=(x,y)=>x.reduce((n,v,i)=>n+Math.abs(v-y[i]),0)/x.length;
  const layout=Math.min(1,diff(a.layout,b.layout)*2),edges=Math.min(1,diff(a.edges,b.edges)*4);
  return {value:.55*palette+.25*layout+.20*edges,palette,layout,edges};
}
function compare(records,references,threshold=.32){
  const refs=references.filter(r=>r.appearanceFingerprint?.version===VERSION),rows=[];
  for(const r of records.filter(r=>r.task==='pelican')){
    if(refs.some(ref=>ref.id===r.id)){rows.push({recordId:r.id,status:'reference',label:'画风参考作品'});continue;}
    const candidates=refs.filter(ref=>ref.id!==r.id).map(ref=>({ref,d:distance(r.appearanceFingerprint,ref.appearanceFingerprint)})).filter(x=>x.d).sort((a,b)=>a.d.value-b.d.value);
    const best=candidates[0];
    if(!best){rows.push({recordId:r.id,status:'unavailable',label:'暂无可比较画面'});continue;}
    const index=Math.round(best.d.value*100),changed=best.d.value>=threshold;
    rows.push({recordId:r.id,referenceId:best.ref.id,referenceUrl:best.ref.artifact?.thumbnailUrl,currentUrl:r.artifact?.thumbnailUrl,index,threshold:Math.round(threshold*100),status:changed?'changed':'similar',label:changed?'画风偏离预警':'未触发画风偏离',components:{palette:Math.round(best.d.palette*100),layout:Math.round(best.d.layout*100),edges:Math.round(best.d.edges*100)}});
  }
  return {version:VERSION,method:'本地画面特征对比',threshold:Math.round(threshold*100),changed:rows.filter(x=>x.status==='changed').length,compared:rows.filter(x=>['changed','similar'].includes(x.status)).length,rows,note:'根据配色、明暗布局与边缘特征筛查画风变化；场景、构图和采样也会改变结果。不是模型身份或降智的证明。'};
}
async function hydrate(records,root){
  let changed=0;
  for(const r of records)if(r.artifact?.thumbnailUrl&&r.appearanceFingerprint?.version!==VERSION){
    const file=path.join(root,'artifacts',r.id,'thumbnail.webp');
    if(!fs.existsSync(file))continue;
    try{r.appearanceFingerprint=await fingerprint(file);changed++}catch{}
  }
  return changed;
}
module.exports={VERSION,fingerprint,distance,compare,hydrate};
