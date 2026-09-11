'use strict';
const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S={tab:'batch',profile:'default',records:[],batches:[],profiles:[],plans:[],jobs:[],evaluator:{},selected:null,detail:null,candyDetail:null,candySelected:null,page:0,revision:null,paused:false};
let editProfile=null,editPlan=null,polling=false,toastTimer,detailSerial=0,lastGallery='',lastPlans='',lastOptions='',lastCandy='',lastScore='',frameId='',thumbRequests=new Set(),ownedJobs=new Set();
const fmt=v=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'—', seconds=v=>v?(v/1000).toFixed(1)+'s':'—';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500)}
async function api(url,body){const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await response.json();if(!response.ok)throw new Error(json.error||'请求失败');return json}
function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function options(){return S.profiles.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+esc(p.model)+'</option>').join('')}
function syncOptions(){const signature=JSON.stringify(S.profiles.map(p=>[p.id,p.name,p.model,p.connected]));if(signature===lastOptions)return;lastOptions=signature;for(const id of ['profile-select','s-profile','evaluator-profile','edit-profile-select']){const previous=$(id).value;$(id).innerHTML=options();if(S.profiles.some(p=>p.id===previous))$(id).value=previous}const filter=$('gallery-profile').value;$('gallery-profile').innerHTML='<option value="all">全部连接</option>'+options();if(S.profiles.some(p=>p.id===filter)||filter==='all')$('gallery-profile').value=filter;$('profile-select').value=S.profile}
function setTab(tab){if(S.tab!==tab)window.scrollTo(0,0);S.tab=tab;playerAction({action:'pause',paused:tab!=='pelican'||S.paused});for(const name of ['batch','pelican','candy','monitor'])$(name+'-view').hidden=name!==tab;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));$('eyebrow').textContent={batch:'MODEL QUALITY / BENCHMARK',pelican:'VISUAL EVALUATION / 02',candy:'REASONING CHECK / 01',monitor:'BACKGROUND MONITOR'}[tab];$('page-title').textContent={batch:'模型状态，一眼看清。',pelican:'让结果自己说话。',candy:'推理过程，值得被看见。',monitor:'按你的节奏，持续检测。'}[tab];$('page-note').textContent={batch:'先看异常，再看证据。每轮判断和真实作品都在这里。',pelican:'运行、观察、评分。每一份动画都有可追溯的判断依据。',candy:'同一道题，独立提问。保留结论和完整回答。',monitor:'可调整频率、题目与连接，关闭页面后继续执行。'}[tab];$('generate').hidden=tab==='monitor'||tab==='batch';$('generate').textContent=tab==='pelican'?'生成并自动评估':'开始糖果检测';renderCandy();if(tab==='pelican')renderGallery();if(tab==='pelican'&&!S.selected){const first=S.records.find(r=>r.task==='pelican'&&r.artifact);if(first)selectRecord(first.id)}if(tab==='batch')renderBatches()}
function recordStatus(r){return r.judgment?.status==='error'?r.judgment.label:r.task==='pelican'?(r.autoEvaluation?.label||'尚未自动评估'):r.judgment.label}
function badge(r){const e=r.autoEvaluation;return e?.score!=null?e.score+'/100':['evaluating','queued'].includes(e?.status)?'评估中':e?.status==='unavailable'?'未完成':'未评估'}
function filtered(){return S.records.filter(r=>r.task==='pelican'&&r.artifact&&($('gallery-profile').value==='all'||r.profileId===$('gallery-profile').value)&&($('gallery-status').value==='all'||($('gallery-status').value==='unrated'?!r.autoEvaluation:['pass','fail','uncertain','unavailable'].includes($('gallery-status').value)&&r.autoEvaluation?.status===$('gallery-status').value)))}
function renderGallery(){if(S.tab!=='pelican')return;const list=filtered();S.page=Math.min(S.page,Math.max(0,Math.ceil(list.length/12)-1));const visible=list.slice(S.page*12,S.page*12+12);const signature=JSON.stringify(visible.map(r=>[r.id,r.artifact.thumbnailUrl,r.autoEvaluation?.status,r.autoEvaluation?.score,r.thumbnailError]))+'|'+S.selected+'|'+S.page+'|'+list.length;if(signature===lastGallery)return;lastGallery=signature;$('gallery-count').textContent=S.records.filter(r=>r.task==='pelican'&&r.artifact).length+'份已保存';$('gallery').innerHTML=visible.length?visible.map(r=>'<button class="work-card '+(r.id===S.selected?'selected':'')+'" data-work="'+r.id+'"><div class="thumb">'+(r.artifact.thumbnailUrl?'<img src="'+esc(r.artifact.thumbnailUrl)+'" alt="鹈鹕动画实际截图" loading="lazy">':'<div class="thumb-placeholder"><span>◈</span>'+(r.thumbnailError?'截图失败 · 点击作品重试':'实际画面生成中')+'</div>')+'</div><div class="card-body"><div class="card-top"><span class="card-title">'+esc(r.profileName||r.model)+'</span><span class="score-badge">'+esc(badge(r))+'</span></div><div class="card-meta">'+esc(fmt(r.timestamp))+' · '+seconds(r.elapsedMs)+'</div></div></button>').join(''):'<div class="gallery-empty">暂无符合筛选的作品。生成新动画或粘贴HTML后会自动保存。</div>';$('pagination-info').textContent='第'+(S.page+1)+'页 / '+Math.max(1,Math.ceil(list.length/12))+'页 · '+list.length+'份';$('page-prev').disabled=!S.page;$('page-next').disabled=(S.page+1)*12>=list.length;const missing=visible.filter(r=>!r.artifact.thumbnailUrl&&!r.thumbnailError&&!thumbRequests.has(r.id)).map(r=>r.id);if(missing.length){missing.forEach(id=>thumbRequests.add(id));api('/api/thumbnails',{ids:missing}).then(({jobs})=>{for(const id of missing)if(!jobs.some(j=>j.recordId===id)){thumbRequests.delete(id);lastGallery=''}}).catch(e=>{missing.forEach(id=>thumbRequests.delete(id));toast(e.message)})}}
async function selectRecord(id){
  const isCandy=S.records.find(r=>r.id===id)?.task==='candy';
  const serial=isCandy?null:++detailSerial;
  if(isCandy)S.candySelected=id;else{S.selected=id;renderGallery()}
  try{
    const record=await api('/api/records/'+id);
    if(isCandy){if(S.candySelected!==id)return;S.candyDetail=record;lastCandy='';renderCandy();return}
    if(serial!==detailSerial)return;
    S.detail=record;renderStage(record);renderScore(record);
    if(record.thumbnailError)api('/api/thumbnails',{ids:[id]}).catch(e=>toast(e.message));
  }catch(e){toast(e.message)}
}
function renderStage(r){if(r.task!=='pelican'||!r.artifact)return;$('stage-title').textContent=(r.profileName||r.model)+' / '+fmt(r.timestamp);$('stage-meta').textContent='1200×800 · '+seconds(r.elapsedMs)+'生成 · 仅播放当前作品';$('preview-link').href=r.artifact.previewUrl;$('download-link').href=r.artifact.originalUrl;if(frameId!==r.id){frameId=r.id;S.paused=false;$('play-toggle').textContent='暂停';$('canvas').classList.remove('empty');$('canvas').innerHTML='<iframe id="player" title="鹈鹕动画大预览" src="'+esc(r.artifact.playerUrl||r.artifact.previewUrl)+'" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>';$('fit-mode').value='fit';$('player').onload=()=>playerAction({action:'pause',paused:S.tab!=='pelican'||S.paused})}}
function renderScore(r){const e=r.autoEvaluation,render=r.renderEvidence;const signature=JSON.stringify([r.id,e,render]);if(signature===lastScore)return;lastScore=signature;const status=e?.status||'unrated';const loading=['evaluating','queued'].includes(status);const labels={rendering:'正在运行并截取画面',vision:'正在分析三帧图像'};let content='<div class="score-head"><div class="score-head-title">自动评估<span class="tiny">MULTI-FRAME</span></div><div class="score-main"><div class="score-number '+(status==='fail'?'fail':'')+'">'+(e?.score!=null?e.score+'<small>/100</small>':'—')+'</div><div class="verdict '+status+'">'+esc(loading?(labels[e.stage]||'自动评估中'):e?.label||'尚未自动评估')+'</div></div><p class="score-summary">'+esc(e?.summary||'对实际渲染的三帧画面评估，无需人工勾选。')+'</p></div><div class="score-content">';
if(e?.dimensions?.length)content+=e.dimensions.map(d=>'<details class="dimension"><summary class="dimension-label"><span>'+esc(d.label)+' <small>查看依据</small></span><span class="mono">'+d.score+'/'+d.max+'</span></summary><div class="bar"><span style="width:'+(d.score/d.max*100)+'%"></span></div><p class="evidence">'+esc(d.evidence)+'</p></details>').join('');
if(render)content+='<div class="runtime-checks"><div class="runtime-check"><span>SVG有效画面</span><span class="'+(render.nonBlank?'ok':'bad')+'">'+(render.nonBlank?'有有效画面':'未通过')+'</span></div><div class="runtime-check"><span>三帧画面变化</span><span class="'+(render.hasMotion?'ok':'bad')+'">'+(render.hasMotion?'已检测到':render.hasMotion===null?'尚未采样':'未检测到')+'</span></div><div class="runtime-check"><span>脚本运行</span><span class="'+(render.errors?.length?'bad':'ok')+'">'+(render.errors?.length?render.errors.length+'个错误':'无运行报错')+'</span></div></div>';
if(e?.issues?.length)content+='<details class="issues"><summary>'+e.issues.length+'项具体问题 · 展开</summary>'+e.issues.map(x=>'• '+esc(x)).join('<br>')+'</details>';
if(r.artifact?.frameUrls?.length)content+='<div class="evidence-frames">'+r.artifact.frameUrls.map((url,i)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener"><img src="'+esc(url)+'" alt="评审证据第'+(i+1)+'帧"></a>').join('')+'</div>';
content+='<button class="button primary evaluate-action" id="evaluate-now" '+(loading?'disabled':'')+'>'+(loading?'<span class="spinner"></span>自动评估中':e?'重新自动评估':'开始自动评估')+'</button><div class="method">'+(e?.judgeModel?'评审：'+esc(e.judgeModel)+' · 置信度'+Math.round((e.confidence||0)*100)+'%<br>':'')+'隔离渲染＋多帧运动＋视觉评分<br>自动判断可能出错，所有依据均保留。</div></div>';$('score-panel').innerHTML=content;$('evaluate-now').onclick=async()=>{try{await api('/api/evaluate',{id:r.id});toast('已加入自动评估队列');await refresh()}catch(error){toast(error.message)}}}
function renderCandy(){if(S.tab!=='candy')return;const list=S.records.filter(r=>r.task==='candy'&&r.profileId===S.profile),r=S.candyDetail?.profileId===S.profile?S.candyDetail:list[0];const signature=JSON.stringify([r?.id,r?.judgment,S.records.length,S.profile,candyPage]);if(signature===lastCandy)return;lastCandy=signature;candyPage=Math.min(candyPage,Math.max(0,Math.ceil(list.length/25)-1));$('candy-page').textContent='第'+(candyPage+1)+'/'+Math.max(1,Math.ceil(list.length/25))+'页';$('candy-prev').disabled=candyPage===0;$('candy-next').disabled=(candyPage+1)*25>=list.length;$('history-count').textContent=list.length+'条';$('history').innerHTML=list.slice(candyPage*25,candyPage*25+25).map(x=>'<tr data-record="'+x.id+'"><td>'+esc(fmt(x.timestamp))+'</td><td>'+esc(x.profileName||'')+'<br><span class="tiny">'+esc(x.model)+'</span></td><td>'+esc(x.judgment.label)+'</td><td>'+seconds(x.elapsedMs)+'</td><td>'+({schedule:'定时',manual:'手动',api:'API',paste:'粘贴'}[x.source]||x.source)+'</td></tr>').join('');if(r&&r.answer===undefined){api('/api/records/'+r.id).then(detail=>{if(S.tab==='candy'&&S.profile===detail.profileId&&(!S.candySelected||S.candySelected===detail.id)){S.candyDetail=detail;lastCandy='';renderCandy()}});return}$('candy-result').innerHTML=r?(r.taskSpec?.variant==='varied'?'<details><summary>本轮变式题目与标准答案'+r.taskSpec.expected+'</summary><pre class="raw-answer">'+esc(r.taskSpec.prompt||JSON.stringify(r.taskSpec.counts))+'</pre></details>':'')+'<div class="candy-result '+(r.judgment.status==='pass'?'ok':'bad')+'">'+esc(r.judgment.label)+'</div><p>'+esc(r.judgment.summary)+'</p><pre class="raw-answer">'+esc(r.answer||'无回答')+'</pre>':'<p>尚无检测结果，点击右上角开始检测。</p>'}
function renderJobs(){
const pending=S.jobs.filter(j=>['queued','running','retry_wait','waiting_eval'].includes(j.status)&&j.operation!=='thumbnail');
$('job-strip').hidden=!pending.length;
if(pending.length){const running=pending.filter(j=>j.status==='running');$('job-strip').innerHTML='<span><i class="spinner"></i>'+running.length+'个任务并行执行 · '+pending.filter(j=>j.operation==='generate').length+'个生成任务未完成 · '+pending.filter(j=>j.operation==='evaluate').length+'个评审任务未完成</span><button class="button small" id="show-batches">查看批次进度</button>';$('show-batches').onclick=()=>setTab('batch')}
$('background-state').textContent=pending.length?'后台执行中':'后台在线 · 关闭页面继续运行';
}
function renderPlans(){const signature=JSON.stringify(S.plans);if(signature===lastPlans)return;lastPlans=signature;$('plans').innerHTML=S.plans.length?S.plans.map(p=>'<article class="plan-card"><div><h3>'+esc(p.name)+'</h3><p>'+esc(S.profiles.find(x=>x.id===p.profileId)?.name||'')+' · 每'+p.intervalMinutes+'分钟 · 每次'+(p.rounds||1)+'轮 · 并发'+(p.concurrency||2)+' · '+p.tasks.map(t=>t==='candy'?'糖果':'鹈鹕＋评估').join(' / ')+'</p><div class="plan-state">'+(p.running?'本轮运行中':p.enabled?'下次 '+fmt(p.nextRunAt):'已暂停')+'</div></div><div class="action-row"><button class="button small" data-plan="'+p.id+'" data-action="edit">调整参数</button><button class="button small" data-plan="'+p.id+'" data-action="toggle">'+(p.enabled?'暂停':'启用')+'</button><button class="button small" data-plan="'+p.id+'" data-action="run">立即跑一轮</button></div></article>').join(''):'<p class="tiny">暂无后台计划。</p>'}
async function refresh(){if(polling)return;polling=true;try{const data=await api('/api/dashboard'+(S.revision?'?since='+S.revision:''));if(data.unchanged){renderJobs();if(S.tab==='batch')renderHistoryStrip();return}S.appearance=data.appearance||{};if(document.activeElement!==$('appearance-threshold'))$('appearance-threshold').value=Math.round((S.appearance.threshold??.32)*100);$('appearance-enabled').checked=S.appearance.enabled!==false;S.batches=data.batches||[];S.limits=data.limits;S.profiles=data.profiles;S.plans=data.schedules;S.jobs=data.jobs;S.evaluator=data.evaluator;const changed=S.revision!==data.revision;S.records=data.records;S.revision=data.revision;syncOptions();renderJobs();renderPlans();renderGallery();renderBatches();if(S.tab==='batch'&&batchSelected)selectBatch(batchSelected);
for(const id of [...ownedJobs]){
  const record=S.records.find(r=>r.jobId===id);
  if(record){ownedJobs.delete(id);if(record.judgment.status==='error')toast(record.judgment.summary);else if(record.task==='candy'){S.candyDetail=null;S.candySelected=record.id;await selectRecord(record.id)}else if(record.artifact){S.page=0;await selectRecord(record.id)}}
}$('global-alert').hidden=!data.storageError;$('global-alert').textContent=data.storageError||'';$('footer-status').textContent=S.records.length+'条记录 · '+S.records.filter(r=>r.task==='pelican'&&r.artifact).length+'份作品 · 本机已连接';const profile=S.profiles.find(p=>p.id===S.profile);$('generate').disabled=!profile?.connected;if(!S.selected&&S.tab==='pelican'){const latest=S.records.find(r=>r.task==='pelican'&&r.artifact);if(latest)await selectRecord(latest.id)}else if(changed&&S.detail){const meta=S.records.find(r=>r.id===S.selected);if(meta&&(JSON.stringify(meta.autoEvaluation)!==JSON.stringify(S.detail.autoEvaluation?{status:S.detail.autoEvaluation.status,label:S.detail.autoEvaluation.label,score:S.detail.autoEvaluation.score,summary:S.detail.autoEvaluation.summary,stage:S.detail.autoEvaluation.stage,evaluatedAt:S.detail.autoEvaluation.evaluatedAt}:null)||!S.detail.artifact?.thumbnailUrl&&meta.artifact?.thumbnailUrl))await selectRecord(S.selected)}renderCandy()}catch(error){$('footer-status').textContent='后台连接中断，请双击启动工具';$('generate').disabled=true}finally{polling=false}}
function fillProfile(id){const p=S.profiles.find(x=>x.id===id);editProfile=p?.id||null;$('p-name').value=p?.name||'';$('p-base').value=p?.baseUrl||'';$('p-model').value=p?.model||'gpt-6-astra';$('p-key').value='';$('p-protocol').value=p?.protocol||'chat';$('p-reasoning').value=p?.reasoning??'medium';$('p-tokens').value=p?.maxTokens||16384;$('p-timeout').value=p?.timeout||600;$('p-token-field').value=p?.tokenField||'max_completion_tokens';$('p-remember').checked=!!p?.remembered;$('p-optional').checked=!!p?.keyOptional;$('profile-status').textContent=p?.connected?'已连接'+(p.remembered?' · 加密记住':' · 会话Key'):''}
function resetPlan(){editPlan=null;$('plan-form-title').textContent='创建计划';$('save-plan').textContent='创建并启用';$('cancel-plan').hidden=true;$('s-name').value='astra双题检测';$('s-interval').value=10;$('s-rounds').value=1;$('s-concurrency').value=2;$('s-variant').value='fixed';$('s-candy').checked=$('s-pelican').checked=true}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{setTab(b.dataset.tab);if(b.dataset.tab==='monitor'){$('evaluator-profile').value=S.evaluator.profileId||'default';$('evaluator-enabled').value=String(S.evaluator.enabled!==false);$('limit-generation').value=S.limits?.generation||4;$('limit-evaluation').value=S.limits?.evaluation||1}});document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('profile-select').onchange=e=>{S.profile=e.target.value;lastCandy='';S.candyDetail=null;S.candySelected=null;candyPage=0;renderCandy();$('generate').disabled=!S.profiles.find(p=>p.id===S.profile)?.connected};
$('generate').onclick=async()=>{try{const result=await api('/api/jobs',{profileId:S.profile,tasks:[S.tab==='candy'?'candy':'pelican']});result.jobs.forEach(j=>ownedJobs.add(j.id));toast('后台已接收，完成后自动保存与评估');await refresh()}catch(e){toast(e.message)}};
$('gallery').onclick=e=>{const b=e.target.closest('[data-work]');if(b)selectRecord(b.dataset.work)};
for(const id of ['gallery-profile','gallery-status'])$(id).onchange=()=>{S.page=0;lastGallery='';renderGallery()};
$('page-prev').onclick=()=>{S.page--;renderGallery()};$('page-next').onclick=()=>{S.page++;renderGallery()};$('refresh').onclick=()=>{thumbRequests.clear();lastGallery='';refresh()};
function playerAction(action){$('player')?.contentWindow.postMessage({type:'probe-player',...action},'*')}
$('play-toggle').onclick=()=>{S.paused=!S.paused;playerAction({action:'pause',paused:S.paused});$('play-toggle').textContent=S.paused?'播放':'暂停'};
$('replay').onclick=()=>{S.paused=false;playerAction({action:'replay'});$('play-toggle').textContent='暂停'};
$('fit-mode').onchange=e=>playerAction({action:'fit',mode:e.target.value});
$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('stage-panel').requestFullscreen();
$('source-open').onclick=()=>{if(!S.detail)return;$('source-text').textContent=S.detail.answer||'';$('source-dialog').showModal()};
$('connections').onclick=()=>{$('edit-profile-select').value=S.profile;fillProfile(S.profile);$('connection-dialog').showModal()};
$('edit-profile-select').onchange=e=>fillProfile(e.target.value);$('add-profile').onclick=()=>fillProfile(null);
$('profile-form').onsubmit=async e=>{e.preventDefault();const payload={id:editProfile||undefined,name:$('p-name').value,baseUrl:$('p-base').value,model:$('p-model').value,apiKey:$('p-key').value,protocol:$('p-protocol').value,reasoning:$('p-reasoning').value,maxTokens:Number($('p-tokens').value),timeout:Number($('p-timeout').value),tokenField:$('p-token-field').value,remember:$('p-remember').checked,keyOptional:$('p-optional').checked};try{const saved=await api('/api/profiles',payload);S.profile=saved.id;$('p-key').value='';$('connection-dialog').close();await refresh();toast('连接已保存')}catch(error){toast(error.message)}finally{payload.apiKey=''}};
$('plan-form').onsubmit=async e=>{e.preventDefault();const current=S.plans.find(p=>p.id===editPlan);try{await api('/api/schedules',{id:editPlan||undefined,name:$('s-name').value,profileId:$('s-profile').value,intervalMinutes:Number($('s-interval').value),rounds:Number($('s-rounds').value),concurrency:Number($('s-concurrency').value),variant:$('s-variant').value,tasks:[...($('s-candy').checked?['candy']:[]),...($('s-pelican').checked?['pelican']:[])],enabled:current?current.enabled:true});resetPlan();await refresh();toast('计划参数已保存')}catch(error){toast(error.message)}};
$('cancel-plan').onclick=resetPlan;
$('plans').onclick=async e=>{const b=e.target.closest('[data-plan]');if(!b)return;const p=S.plans.find(x=>x.id===b.dataset.plan);if(b.dataset.action==='edit'){editPlan=p.id;$('plan-form-title').textContent='调整计划';$('s-name').value=p.name;$('s-profile').value=p.profileId;$('s-interval').value=p.intervalMinutes;$('s-rounds').value=p.rounds||1;$('s-concurrency').value=p.concurrency||2;$('s-variant').value=p.variant||'fixed';$('s-candy').checked=p.tasks.includes('candy');$('s-pelican').checked=p.tasks.includes('pelican');$('save-plan').textContent='保存参数';$('cancel-plan').hidden=false;$('s-interval').focus();return}try{await api(b.dataset.action==='run'?'/api/schedules/run':'/api/schedules',b.dataset.action==='run'?{id:p.id}:{...p,enabled:!p.enabled});await refresh()}catch(error){toast(error.message)}};
$('evaluator-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/evaluator',{profileId:$('evaluator-profile').value,enabled:$('evaluator-enabled').value==='true'});toast('自动评审设置已保存');await refresh()}catch(error){toast(error.message)}};
$('paste-open').onclick=()=>{$('paste-dialog').showModal()};
$('save-paste').onclick=async()=>{try{const record=await api('/api/paste',{task:$('paste-task').value,answer:$('paste-answer').value});$('paste-answer').value='';$('paste-dialog').close();await refresh();setTab(record.task);await selectRecord(record.id);toast('已归档，鹈鹕作品进入自动评估')}catch(error){toast(error.message)}};
$('job-strip').onclick=async e=>{const b=e.target.closest('[data-cancel]');if(b){await api('/api/jobs/cancel',{id:b.dataset.cancel});await refresh()}};
$('history').onclick=e=>{const row=e.target.closest('[data-record]');if(row)selectRecord(row.dataset.record)};
$('copy-candy').onclick=()=>navigator.clipboard.writeText(ModelProbe.prompts.candy).then(()=>toast('题目已复制')).catch(()=>toast('无法复制，请从原始题目读取'));
$('export').onclick=async()=>{try{download('model-probe-records.json',JSON.stringify(await api('/api/records'),null,2))}catch(e){toast(e.message)}};
new ResizeObserver(()=>{if(innerWidth>800)$('score-panel').style.maxHeight=$('stage-panel').getBoundingClientRect().height+'px';else $('score-panel').style.maxHeight='none'}).observe($('stage-panel'));


let batchSelected=null,batchDetail=null,batchSerial=0,batchOptionsSignature='',batchRenderSignature='',candyPage=0;
const pct=n=>n==null?'—':(n*100).toFixed(0)+'%',dec=n=>n==null?'—':n.toFixed(1), taskName=t=>t==='candy'?'糖果':'鹈鹕';
function syncBatchOptions(){
  const signature=JSON.stringify(S.profiles.map(p=>[p.id,p.name,p.connected]));
  if(signature===batchOptionsSignature)return;
  const checked=[...document.querySelectorAll('[data-b-profile]:checked')].map(x=>x.value);
  $('batch-profiles').innerHTML=S.profiles.map(p=>'<label><input type="checkbox" data-b-profile value="'+esc(p.id)+'" '+((checked.length?checked.includes(p.id):p.id===S.profile)?'checked':'')+' '+(!p.connected?'disabled':'')+'>'+esc(p.name)+'<small>'+esc(p.model)+(p.connected?'':' · 未连接')+'</small></label>').join('');
  batchOptionsSignature=signature;batchEstimate();
}
function batchEstimate(){
  const profiles=document.querySelectorAll('[data-b-profile]:checked').length,rounds=Number($('b-rounds').value)||0,count=profiles*rounds*(Number($('b-candy').checked)+Number($('b-pelican').checked)),evaluation=S.evaluator.enabled&&$('b-pelican').checked?profiles*rounds:0;
  $('batch-estimate').textContent=profiles+'个连接 × '+rounds+'轮 · '+count+'次生成'+(evaluation?'＋最多'+evaluation+'次图像评审':'')+' · 重试另计';
  $('start-batch').disabled=!profiles||!count;
}
function renderBatches(){
  if(!S.batches)return;
  syncBatchOptions();
  $('batch-count').textContent=S.batches.length+'个';
  const signature=JSON.stringify(S.batches.map(b=>[b.id,b.completed,b.total,b.running,b.errors,b.status]))+'|'+batchSelected;
  if(signature!==batchRenderSignature){batchRenderSignature=signature;$('batch-list').innerHTML=S.batches.length?S.batches.map(b=>'<button class="batch-item '+(batchSelected===b.id?'selected':'')+'" data-batch="'+b.id+'"><strong>'+esc(b.name)+'</strong><span>'+esc(fmt(b.createdAt))+'</span><span>'+({done:'已结束',running:'执行中',paused:'已暂停',cancelled:'已取消'}[b.status]||b.status)+' · '+b.completed+'/'+b.total+'完成</span><progress max="'+b.total+'" value="'+b.completed+'"></progress></button>').join(''):'<p class="tiny">还没有批次记录。</p>'}
  if(!batchSelected&&S.batches.length)selectBatch(S.batches[0].id);if(S.revision&&!S.batches.length){$('result-overview').innerHTML='<div class="panel"><h2>开始第一轮检测</h2><p>选择题目与轮数，完成后这里会显示明确结论、每轮作品和异常依据。</p></div>';$('batch-setup').open=true}
}
async function selectBatch(id){
  batchSelected=id;renderBatches();const serial=++batchSerial;
  try{const report=await api('/api/batches/'+id);if(serial!==batchSerial)return;batchDetail=report;renderBatchDetail();renderOverview(report)}catch(e){toast(e.message)}
}
$('batch-form').oninput=batchEstimate;
$('batch-form').onsubmit=async e=>{
  e.preventDefault();$('start-batch').disabled=true;
  try{const b=await api('/api/batches',{name:$('b-name').value||'模型快速复测',profileIds:[...document.querySelectorAll('[data-b-profile]:checked')].map(x=>x.value),rounds:Number($('b-rounds').value),concurrency:Number($('b-concurrency').value),retries:Number($('b-retries').value),variant:$('b-variant').value,seed:$('b-seed').value,tasks:[...($('b-candy').checked?['candy']:[]),...($('b-pelican').checked?['pelican']:[])]});batchSelected=b.id;$('batch-setup').open=false;await refresh();await selectBatch(b.id);toast('批次已启动，按设置并行执行')}catch(error){toast(error.message)}finally{batchEstimate()}
};
$('batch-list').onclick=e=>{const b=e.target.closest('[data-batch]');if(b)selectBatch(b.dataset.batch)};
$('batch-detail').onclick=async e=>{
  const control=e.target.closest('[data-batch-action]'),base=e.target.closest('[data-baseline]'),result=e.target.closest('[data-result]'),cancel=e.target.closest('[data-job-cancel]');
  try{
    if(control){if(control.disabled)return;const action=control.dataset.batchAction;control.disabled=true;const next=await api(action==='repeat'?'/api/batches/repeat':action==='retry'?'/api/batches/retry':'/api/batches/control',{id:batchSelected,action});if(['retry','repeat'].includes(action))batchSelected=next.id;await refresh();await selectBatch(batchSelected)}
    if(base){await api('/api/baselines',{batchId:batchSelected,profileId:base.dataset.baseline});await selectBatch(batchSelected);toast('可信基线已保存')}
    if(cancel){await api('/api/jobs/cancel',{id:cancel.dataset.jobCancel});await refresh();await selectBatch(batchSelected)}
    if(result){const r=S.records.find(r=>r.id===result.dataset.result);if(r?.artifact){setTab('pelican');await selectRecord(r.id);window.scrollTo(0,0)}else{const detail=await api('/api/records/'+result.dataset.result);$('source-text').textContent=(detail.taskSpec?.prompt?'本次题目：\n'+detail.taskSpec.prompt+'\n\n':'')+'结果：'+detail.judgment.summary+'\n\n'+(detail.answer||'无正文');$('source-dialog').showModal()}}
  }catch(error){toast(error.message)}finally{if(control)control.disabled=false}
};
$('batch-refresh').onclick=async()=>{await refresh();if(batchSelected)await selectBatch(batchSelected)};
async function batchExport(csv=false){
  if(!batchDetail)return toast('先选择一个批次');
  const details=[];for(const id of batchDetail.records){const detail=await api('/api/records/'+id);const result=batchDetail.results?.find(x=>x.id===id);if(result){detail.latestEvaluation=detail.autoEvaluation;detail.autoEvaluation=result.autoEvaluation;detail.batchEvaluation=result.autoEvaluation;detail.judgment={...detail.judgment,...result.judgment}}details.push(detail)}
  if(!csv)return download('model-probe-'+batchDetail.id+'.json',JSON.stringify({report:batchDetail,records:details},null,2));
  const safe=v=>'"'+String(v??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[['批次','轮次','连接','模型','题目','结果','分数','耗时ms','接口报告模型'],...details.map(r=>[batchDetail.name,r.round,r.profileName,r.model,r.task,recordStatus(r),r.autoEvaluation?.score,r.elapsedMs,r.returnedModel])];
  download('model-probe-'+batchDetail.id+'.csv','\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n'),'text/csv');
}
$('batch-export').onclick=()=>batchExport().catch(e=>toast(e.message));
$('batch-csv').onclick=()=>batchExport(true).catch(e=>toast(e.message));
$('limits-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/limits',{generation:Number($('limit-generation').value),evaluation:Number($('limit-evaluation').value)});toast('并发上限已保存');await refresh()}catch(error){toast(error.message)}};
$('candy-prev').onclick=()=>{candyPage=Math.max(0,candyPage-1);lastCandy='';renderCandy()};
$('candy-next').onclick=()=>{candyPage++;lastCandy='';renderCandy()};

setTab('batch');refresh();setInterval(refresh,1800);setInterval(()=>{if(S.jobs.some(j=>j.status==='running'))renderJobs()},1000);

function batchTrend(records){
  if(!records.length)return '';
  const series=[{name:'糖果判定',color:'#a9ebc5',data:records.filter(r=>r.task==='candy').map(r=>({x:r.round||1,y:r.judgment.status==='pass'?100:r.judgment.status==='fail'?0:null,label:r.judgment.label}))},{name:'鹈鹕评分',color:'#73bafa',data:records.filter(r=>r.task==='pelican').map(r=>({x:r.round||1,y:r.autoEvaluation?.score??null,label:recordStatus(r)}))}];
  const max=Math.max(1,...records.map(r=>r.round||1)),width=640,height=140,pad=32;
  const x=n=>max===1?width/2:pad+(n-1)/(max-1)*(width-pad*2),y=n=>height-pad-n/100*(height-pad*2);
  return '<details class="trend-panel" open><summary>逐轮走势 <span>绿色：糖果通过/失败 · 蓝色：鹈鹕分数</span></summary><svg viewBox="0 0 640 140" role="img" aria-label="每轮糖果判断和鹈鹕评分趋势">'+[0,50,100].map(n=>'<line x1="32" y1="'+y(n)+'" x2="608" y2="'+y(n)+'" stroke="#2e414e"/><text x="6" y="'+(y(n)+4)+'" fill="#86a1b3" font-size="10">'+n+'</text>').join('')+series.map(s=>s.data.filter(d=>d.y!==null).map(d=>'<circle cx="'+x(d.x)+'" cy="'+y(d.y)+'" r="4" fill="'+s.color+'"><title>'+esc(s.name+' · 第'+d.x+'轮 · '+d.label+' · '+d.y)+'</title></circle>').join('')).join('')+'<text x="32" y="137" fill="#86a1b3" font-size="10">第1轮</text><text x="572" y="137" fill="#86a1b3" font-size="10">第'+max+'轮</text></svg></details>';
}

function renderOverview(b){
  const all=b.results||[],c=all.filter(r=>r.task==='candy'),p=all.filter(r=>r.task==='pelican');
  const pass=r=>r.task==='candy'?r.judgment?.status==='pass':r.autoEvaluation?.status==='pass';
  const good=all.filter(pass).length,bad=all.filter(r=>r.task==='candy'?r.judgment?.status==='fail':r.autoEvaluation?.status==='fail').length;
  const error=(b.stats||[]).reduce((n,s)=>n+s.summary.candy.errors+s.summary.pelican.errors,0);
  const styleChanged=b.stats.reduce((n,s)=>n+(s.insight?.appearance?.changed||0),0),waiting=Math.max(0,b.total-good-bad-error),alert=bad||error||styleChanged;
  const title=b.status==='running'?'检测正在进行':alert?(styleChanged&&!bad&&!error?'质量通过，画风出现偏离':'发现需要关注的结果'):waiting?'部分结果尚不能判断':'本批次全部通过';
  const scores=[...p].sort((a,c)=>a.round-c.round).filter(r=>['pass','fail'].includes(r.autoEvaluation?.status)).map(r=>r.autoEvaluation?.score).filter(Number.isFinite),average=scores.length?scores.reduce((a,c)=>a+c,0)/scores.length:null;
  const styles=b.stats.map(s=>s.insight?.appearance).filter(Boolean),compared=styles.reduce((n,s)=>n+(s.compared||0),0),disabled=styles.length&&styles.every(s=>s.disabled);
  $('result-overview').innerHTML='<div class="outcome '+(alert?'warn':waiting?'pending':'ok')+'"><div class="outcome-mark">'+(alert?'!':waiting?'…':'✓')+'</div><div><span class="outcome-kicker">'+esc(b.name)+' · '+esc(fmt(b.createdAt))+'</span><h2>'+title+'</h2><p>'+good+'/'+b.total+'项通过 · '+bad+'项未通过 · '+error+'次接口失败'+(waiting?' · '+waiting+'项待判定':'')+'</p></div><button id="open-new-batch" class="button primary">新建检测</button></div><div class="overview-metrics"><div><span>糖果结论</span><strong>'+c.filter(pass).length+'<small>/'+c.length+'</small></strong><p>按最终结论判断，提及29不影响通过</p></div><div><span>鹈鹕平均分</span><strong>'+(average===null?'—':average.toFixed(1))+'<small>/100</small></strong><p>'+(scores.length?scores.join(' / ')+' · 每轮原始评分':'等待有效评分')+(p.length>scores.length?' · '+(p.length-scores.length)+'份未计入':'')+'</p></div><div><span>画风偏离</span><strong>'+(compared?styleChanged:'—')+(compared?'<small>份</small>':'')+'</strong><p>'+(disabled?'画风对比已关闭':compared?'已比较'+compared+'份 · 独立于质量分':'尚无可比较画面')+'</p></div></div>';
  renderHistoryStrip();
  $('open-new-batch').onclick=()=>{$('batch-setup').open=true;$('batch-setup').scrollIntoView({behavior:'smooth',block:'start'})};
}

function renderBatchDetail(){
  const b=batchDetail;if(!b)return;
  const opened=[...$('batch-detail').querySelectorAll('details[open][data-keep]')].map(e=>e.dataset.keep);
  const pending=['running','paused'].includes(b.status),records=b.results||[];
  let html='<div class="report-top"><div><h2>'+esc(b.name)+'</h2><p class="tiny">'+b.rounds+'轮 · '+b.profiles.length+'个连接 · 并发'+b.concurrency+' · '+b.completed+'/'+b.total+'完成</p></div><div class="action-row">'+(pending?'<button class="button small" data-batch-action="'+(b.paused?'resume':'pause')+'">'+(b.paused?'继续批次':'暂停批次')+'</button><button class="button small" data-batch-action="cancel">取消剩余</button>':'<button class="button small" data-batch-action="repeat">按原条件复测</button><button class="button small" data-batch-action="retry" '+(!b.retryableCount?'disabled':'')+'>重试未完成请求</button>')+'<button class="button small" data-export="json">导出JSON</button><button class="button small" data-export="csv">导出CSV</button></div></div>';
  if(pending)html+='<progress class="batch-progress" max="'+b.total+'" value="'+b.completed+'"></progress>';
  for(const s of b.stats){
    const ins=s.insight,own=records.filter(r=>r.profileId===s.profileId),c=s.summary.candy,p=s.summary.pelican;
    let scoreExplanation='';
    html+='<section class="connection-results"><div class="report-top"><h3>'+esc(s.profileName)+'</h3><button class="button small" data-baseline="'+s.profileId+'" '+(b.status!=='done'?'disabled':'')+'>设为可信基线</button></div>';
    if(ins){
      scoreExplanation='<div class="score-explainer"><div><span>这次分数怎么看</span><h3>'+ (ins.average===null?'等待评分':ins.average.toFixed(1)+'分')+(ins.delta===null?'':'<small class="'+(ins.delta<0?'down':'up')+'">'+(ins.delta>=0?'+':'')+ins.delta.toFixed(1)+'<span>相对参考均分</span></small>')+'</h3><p>'+esc(ins.explanation)+'</p><p class="tiny">'+(ins.reference?'参考：'+esc(ins.reference.name)+' · '+dec(ins.referenceMean)+'分。':'还没有上一批或可信基线。')+esc(ins.caveat)+'</p></div><div class="dimension-bars">'+ins.dimensions.map(d=>'<div><span>'+esc(d.label)+'</span><div class="dim-track"><i style="width:'+(d.mean===null?0:d.mean/d.max*100)+'%"></i></div><b>'+dec(d.mean)+'/'+d.max+'</b></div>').join('')+'</div></div>';
    }
    const rounds=[...new Set((b.requests||[]).filter(j=>j.profileId===s.profileId&&!j.parentId).map(j=>j.round))].sort((a,c)=>a-c);
    if(!rounds.length)rounds.push(...[...new Set(own.map(r=>r.round||1))].sort((a,c)=>a-c));
    html+='<div class="round-gallery">'+rounds.map(round=>{
      const rows=own.filter(r=>r.round===round),candy=rows.find(r=>r.task==='candy'),pelican=rows.find(r=>r.task==='pelican'),ev=pelican?.autoEvaluation,art=pelican?.artifact,style=ins?.appearance?.rows.find(x=>x.recordId===pelican?.id);
      const full=ins?.examples.find(x=>x.id===pelican?.id),cs=candy?.judgment?.status,ps=ev?.status;
      return '<article class="round-card"><div class="round-top"><strong>第'+round+'轮</strong><span class="result-tag '+(ps==='pass'?'pass':ps==='fail'?'fail':'muted')+'">'+(ev?.score!=null?ev.score+'分':b.tasks.includes('pelican')?'待评分':'糖果检测')+'</span></div>'+(art?'<button class="round-image" data-result="'+pelican.id+'" aria-label="预览第'+round+'轮鹈鹕作品">'+(art.thumbnailUrl?'<img src="'+esc(art.thumbnailUrl)+'" alt="第'+round+'轮实际动画截图" loading="lazy">':'<span>已保存作品，截图生成中</span>')+'<span class="image-open">播放动画↗</span></button>':b.tasks.includes('pelican')?'<div class="round-empty">'+(pelican?'本轮没有可预览作品':'动画正在等待生成')+'</div>':'')+
        '<div class="round-body">'+(b.tasks.includes('candy')?'<button class="result-line '+(cs==='pass'?'pass':cs==='fail'||cs==='error'?'fail':'muted')+'" '+(candy?'data-result="'+candy.id+'"':'disabled')+'><span>'+(cs==='pass'?'✓':cs==='fail'?'×':'·')+' 糖果</span><b>'+esc(candy?cs==='pass'?'结论'+(candy.taskSpec?.expected||21)+' · 通过':candy.judgment.label:'等待回答')+'</b><span>查看›</span></button>':'')+(b.tasks.includes('pelican')?'<div class="result-line '+(ps==='pass'?'pass':ps==='fail'?'fail':'muted')+'"><span>'+(ps==='pass'?'✓':ps==='fail'?'×':'·')+' 鹈鹕</span><b>'+esc(ev?.label||'等待评估')+'</b></div>':'')+
        (style?'<div class="style-badge '+(style.status==='changed'?'warn':'')+'">'+esc(style.label)+(style.index===undefined?'':' · 差异'+style.index+'/100')+'</div>':'')+
        (full?.issues.length?'<p class="deduction-note">'+esc(full.issues[0])+'</p>':ev?.summary?'<p class="deduction-note">'+esc(ev.summary)+'</p>':'')+
        (art?'<button class="button small ghost" data-style-reference="'+pelican.id+'" data-profile="'+s.profileId+'">设为画风参考</button>':'')+'</div></article>';
    }).join('')+'</div>';
    html+=scoreExplanation;
    if(ins?.appearance){
      const app=ins.appearance,most=[...app.rows].filter(x=>x.index!==undefined).sort((a,c)=>c.index-a.index)[0];
      html+='<details class="appearance-detail" data-keep="style-'+s.profileId+'"><summary>画风对照：'+(app.disabled?'已关闭':app.compared?app.changed?app.changed+'份触发偏离预警':'未触发偏离预警':app.rows.some(x=>x.status==='reference')?'已指定参考作品':'等待参考画面')+'<span>'+esc(app.referenceName||'')+'</span></summary>';
      if(most)html+='<div class="compare-pair"><figure><img src="'+esc(most.referenceUrl)+'" alt="参考作品"><figcaption>参考画面</figcaption></figure><figure><img src="'+esc(most.currentUrl)+'" alt="当前差异最大的作品"><figcaption>本批次差异最大 · '+most.index+'/100</figcaption></figure></div><p>配色差异'+most.components.palette+' · 布局差异'+most.components.layout+' · 边缘差异'+most.components.edges+'。预警阈值'+most.threshold+'，可在后台计划页调整。</p>';
      html+='<p class="tiny">'+esc(app.note||'画风对比已关闭。')+'</p><button class="button small" data-reset-reference="'+s.profileId+'">恢复自动参考</button></details>';
    }
    html+='<details class="stats-more" data-keep="stats-'+s.profileId+'"><summary>基线结论、置信区间与接口证据</summary><strong>'+esc(s.comparison.label)+'</strong><p>'+esc(s.comparison.notes.join(' '))+'</p><p>糖果95%区间：'+(c.ci?c.ci.map(pct).join('～'):'样本不足')+'；鹈鹕95%区间：'+(p.ci?p.ci.map(pct).join('～'):'样本不足')+'。判定覆盖率：'+pct(c.coverage)+' / '+pct(p.coverage)+'。</p><p>接口报告模型：'+esc([...new Set([...c.returnedModels,...p.returnedModels])].join('、')||'未提供')+'。接口报告名不能验证实际模型身份。</p><p>生成token '+(c.usage+p.usage)+' · 评审token '+p.evaluationTokens+' · 规则'+esc(b.scoringRulesVersion||'')+'</p></details></section>';
  }
  const active=(b.requests||[]).filter(j=>['queued','running','retry_wait','waiting_eval'].includes(j.status));
  if(active.length)html+='<details class="active-jobs" open><summary>正在执行与排队'+active.length+'项</summary>'+active.slice(0,30).map(j=>'<div><span>第'+j.round+'轮 · '+taskName(j.task)+' · '+esc({queued:'排队中',running:{generating:'生成中',rendering:'截图中',vision:'评审中'}[j.stage]||'执行中',waiting_eval:'等待自动评审',retry_wait:'等待重试'}[j.status])+(j.chars?' · '+j.chars+'字符':'')+'</span><button class="button small" data-job-cancel="'+j.id+'">取消</button></div>').join('')+'</details>';
  $('batch-detail').innerHTML=html;
  for(const d of $('batch-detail').querySelectorAll('details[data-keep]'))if(opened.includes(d.dataset.keep))d.open=true;
}
async function openOverviewRecord(id){
  const r=S.records.find(r=>r.id===id);
  if(r?.artifact){setTab('pelican');await selectRecord(id);window.scrollTo(0,0)}
  else{const detail=await api('/api/records/'+id);$('source-text').textContent='结果：'+detail.judgment.summary+'\n\n'+(detail.taskSpec?.prompt?'本次题目：\n'+detail.taskSpec.prompt+'\n\n':'')+(detail.answer||'无正文');$('source-dialog').showModal()}
}
$('batch-detail').addEventListener('click',async e=>{
  const reference=e.target.closest('[data-style-reference]'),reset=e.target.closest('[data-reset-reference]'),ex=e.target.closest('[data-export]');
  try{
    if(reference){await api('/api/appearance',{profileId:reference.dataset.profile,recordId:reference.dataset.styleReference});await refresh();await selectBatch(batchSelected);toast('画风参考已保存，不改变质量评分基线')}
    if(reset){await api('/api/appearance',{profileId:reset.dataset.resetReference,recordId:null});await refresh();await selectBatch(batchSelected);toast('已恢复使用可信基线或上一批作品作为参考')}
    if(ex)await batchExport(ex.dataset.export==='csv');
  }catch(error){toast(error.message)}
});
$('appearance-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/appearance',{enabled:$('appearance-enabled').checked,threshold:Number($('appearance-threshold').value)/100});toast('画风预警设置已保存');await refresh();if(batchSelected)await selectBatch(batchSelected)}catch(error){toast(error.message)}};

function renderHistoryStrip(){
  const recent=S.records.filter(r=>Date.now()-Date.parse(r.timestamp)<=86400000&&Date.parse(r.timestamp)<=Date.now()),shown=recent.slice(0,120).reverse();
  const status=r=>r.cancelled?'cancelled':r.judgment?.status==='error'?'error':r.task==='candy'?r.judgment?.status:['pass','fail'].includes(r.autoEvaluation?.status)?r.autoEvaluation.status:'review';
  const label={pass:'通过',fail:'未通过',review:'不确定',error:'接口失败',cancelled:'取消'};
  const count=kind=>recent.filter(r=>status(r)===kind).length;
  $('recent-history').innerHTML='<section class="history-strip"><div><h3>最近24小时 · 全部连接</h3><span>通过'+count('pass')+' · 未通过'+count('fail')+' · 接口失败'+count('error')+' · 待判定/取消'+(recent.length-count('pass')-count('fail')-count('error'))+'</span></div><div class="status-strip" aria-label="最近24小时检测时间线">'+shown.map(r=>'<button class="status-cell '+status(r)+'" data-overview-record="'+r.id+'" aria-label="'+esc(fmt(r.timestamp)+' '+taskName(r.task)+' '+label[status(r)])+'" title="'+esc(fmt(r.timestamp)+' '+taskName(r.task)+' '+label[status(r)])+'"></button>').join('')+'</div><div class="strip-key"><span class="pass">■通过</span><span class="fail">■未通过</span><span class="error">■接口失败</span><span class="review">■待判定/取消</span><span>展示最近'+shown.length+'项 · 点击查看回答或作品</span></div></section>';
  $('recent-history').onclick=e=>{const item=e.target.closest('[data-overview-record]');if(item)openOverviewRecord(item.dataset.overviewRecord).catch(error=>toast(error.message))};
}
