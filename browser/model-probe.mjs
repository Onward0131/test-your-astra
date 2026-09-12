/* Generated from core.cjs, transport.cjs and preview.cjs. MIT; see LICENSE. */
const Core = (() => {
const module = { exports: {} };

/* Model Probe: dependency-free judging rules; Node.js and browser compatible. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModelProbe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.3.1';
  const prompts = {
    candy: '在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n\n| 形状 | 苹果味 | 桃子味 | 西瓜味 |\n| 圆形 | 7 | 9 | 8 |\n| 五角星形 | 7 | 6 | 4 |\n\n不许联网自己计算',
    pelican: '创建一个HTML，内容是SVG绘制一个剃鹕骑自行车的2D动画，你不需要任何测试'
  };
  const standard = '可以凭手感选形状时，最少21颗：9颗圆形＋12颗五角星形。圆形西瓜味只有8颗，所以9颗圆形必有苹果味或桃子味。五角星形非苹果味共10颗，非桃子味共11颗，所以12颗五角星形必有苹果味和桃子味。20颗不够：圆形≤8颗时可全为西瓜味；圆形9～15颗时，两种形状都可只含苹果味和西瓜味；圆形≥16颗时，五角星形≤4颗，可全为西瓜味。若不允许选形状而任意抓取，则最少29颗。';
  const labels = { pass: '结论符合', fail: '结论不符', review: '结论不确定', artifact: '作品已提取', error: '请求失败' };
  function normalize(text) {
    return String(text || '').replace(/\\(?:boxed|mathbf|textbf|mathrm)\{([^{}]*)\}/g, '$1').replace(/[*#$`]/g, '').replace(/二十一/g, '21').replace(/二十九/g, '29').replace(/２０/g, '20').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248));
  }
  function candy(text,spec) {
    const expected=Number.isInteger(spec?.expected)?spec.expected:21;
    const failures=spec?.failures||[[8,17],[15,11],[17,10],[24,4]];
    const counts=spec?.counts||[[7,9,8],[7,6,4]];
    const chineseNumber=value=>{
      const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
      if(value.includes('十')){const [a,b]=value.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0)}
      return digits[value]??value;
    };
    const clean=normalize(text).replace(/\\[()[\]]/g,'').replace(/\\(?:text|mathrm)\{([^{}]*)\}/g,'$1').replace(/＝/g,'=').replace(/[零〇一二两三四五六七八九]?十[零〇一二两三四五六七八九]?|[零〇一二两三四五六七八九](?=\s*(?:颗|粒|个))/g,m=>String(chineseNumber(m)));
    const values=[],ignored=[],schemes=[],conclusions=[],applicable=[];
    const sentences=clean.split(/[。！!？?；;\n]+/).map(x=>x.trim()).filter(Boolean);
    const blindRe=/(?:不能|不允许|不可|无法|不能够)[^，,]{0,16}(?:挑|选|分辨)[^，,]{0,8}形状|(?:不能|不允许|不可|无法)[^，,]{0,10}形状[^，,]{0,8}(?:挑|选)|(?:完全|纯粹|只能|随机|任意|直接|不加选择)[^，,]{0,7}(?:抓取|抽取|摸取|取出|地取|取糖)|不(?:按|挑|选)形状/;
    const marker=/(?:答案|结论|最少|至少|最小|需要(?:取出|摸出|抽取)?|总共|总计|合计|共计|总数|共|minimum(?:\s+number)?|at\s+least|answer|total)(?:[^0-9。；\n]{0,28})([0-9]+(?:\.[0-9]+)?)/gi;
    for(const sentence of sentences){
      const clauses=sentence.split(/(?:但(?:是)?|而(?=是)|however|but)/i);
      for(const clause of clauses){
        const blind=blindRe.test(clause);
        if(!blind)applicable.push(clause);
        for(const match of clause.matchAll(marker)){
          const prefix=match[0].slice(0,match[0].lastIndexOf(match[1]));
          const after=clause.slice(match.index+match[0].length);
          const before=clause.slice(Math.max(0,match.index-12),match.index);
          // Quantities for one shape are construction details, not the total.
          if(/^\s*(?:颗|个|粒)?\s*(?:的)?(?:圆形|五角星形?|星形)/.test(after))continue;
          if(/(?:圆形|五角星|星形|苹果|桃子|西瓜)/.test(prefix))continue;
          if(/(?:不超过|不多于|少于|大于|至多|假设|假定|设为)/.test(prefix))continue;
          if(/(?:设|假设|假定|由|若|如果)[^，,。]{0,10}$/.test(before)&&/^(?:总数|总共|合计|共)/.test(match[0]))continue;
          if(/^\s*(?:颗|个|粒)?\s*(?:的)?(?:苹果|桃子|西瓜|口味)/.test(after))continue;
          if(/(?:圆形|五角星|星形|苹果|桃子|西瓜|袋中|袋内|袋子里)[^0-9，,。]{0,25}(?:共有?|总计|总数|合计)/.test(clause.slice(0,match.index+prefix.length).split(/[，,]/).at(-1)))continue;
          if(/^(?:至少|at\s+least)/i.test(match[0])&&/有|包含|含有/.test(prefix))continue;
          if(/(?:圆形|五角星形?|星形)[^，,。]{0,5}$/.test(before))continue;
          if(/(?:不是|并非|不为|不等于|不应是|不能是|不是说)\s*$/.test(prefix))continue;
          if(/^\s*(?:颗|个|粒)?\s*(?:是不对|是错误|不正确|不够|不足|无法保证|不能保证)/.test(after))continue;
          if(/^\s*(?:颗|个|粒)[^0-9。；]{0,18}(?:不能保证|无法保证|不能配对|不满足)/.test(after))continue;
          if(/^\s*[+＋]/.test(after)){
            const sum=after.match(/^\s*[+＋]\s*(\d+)\s*=\s*(\d+)/);
            if(sum&&Number(match[1])+Number(sum[1])===Number(sum[2]))(blind?ignored:values).push(Number(sum[2]));
            continue;
          }
          (blind?ignored:values).push(Number(match[1]));
          if(!blind&&/(?:答案|结论|最少|minimum|answer)/i.test(match[0])&&!/(?:假设|假定|有人认为|如果)[^，,。]{0,12}$/.test(before)){
            conclusions.push({value:Number(match[1]),explicit:/(?:最终|最后|更正|修正|改答|final)/i.test(before+prefix),ambiguous:/^\s*(?:颗|个|粒)?\s*(?:或(?:者)?|\/)\s*\d/.test(after)});
          }
        }
        const correction=clause.match(/^\s*(?:是|而是)\s*(\d+)\s*(?:颗|个|粒)?/);
        if(correction&&!blind)values.push(Number(correction[1]));
      }
      // Check only a positively proposed, paired construction, not counterexamples.
      if(/(?:取|摸出|抽出|选择|方案)/.test(sentence)&&!/(?:不能|不够|不足|反例|错误|假设|如果|若|无法|不保证|不成立|任意|随机)/.test(sentence)){
        const round=sentence.match(/(\d+)\s*(?:颗|个|粒)?\s*圆形|圆形\s*(?:取|糖果|糖|的)?\s*(\d+)\s*(?:颗|个|粒)?/);
        const star=sentence.match(/(\d+)\s*(?:颗|个|粒)?\s*(?:五角星形?|星形)|(?:五角星形?|星形)\s*(?:取|糖果|糖|的)?\s*(\d+)\s*(?:颗|个|粒)?/);
        if(round&&star){
          const r=Number(round[1]||round[2]),s=Number(star[1]||star[2]);
          const feasible=r>=0&&s>=0&&r<=counts[0].reduce((a,b)=>a+b,0)&&s<=counts[1].reduce((a,b)=>a+b,0);
          schemes.push({round:r,star:s,total:r+s,guarantees:feasible&&!failures.some(([a,b])=>r<=a&&s<=b)});
        }
      }
    }
    const bare=clean.trim().match(/^(\d+(?:\.\d+)?)\s*(?:颗|个|粒)?[。.!]?$/);
    if(bare)values.push(Number(bare[1]));
    const answers=[...new Set(values)];
    let status='review',summary='未提取到唯一总数，暂记为结论不确定。';
    if(answers.length===1){status=answers[0]===expected?'pass':'fail';summary=status==='pass'?'结论'+expected+'与本题计算结果一致。':'提取到总数'+answers[0]+'，本题标准答案为'+expected+'。'}
    else if(answers.length>1)summary='出现多个总数（'+answers.join('、')+'），暂不计为明确通过或失败。';
    const selected=conclusions.filter(x=>x.explicit).at(-1)||conclusions.at(-1),finalAnswer=selected&&!selected.ambiguous?selected.value:answers.length===1?answers[0]:null;
    if(selected){
      if(selected.ambiguous){status='review';summary='最终结论仍给出了多个候选答案，暂记为不确定。';}
      else{status=finalAnswer===expected?'pass':'fail';summary=status==='pass'?'最终结论为'+expected+'，符合本题标准；正文出现其他数字不影响通过。':'最终结论为'+finalAnswer+'，本题标准答案为'+expected+'。';}
    }
    const invalid=schemes.filter(s=>s.total===expected&&!s.guarantees);
    const valid=schemes.filter(s=>s.total===expected&&s.guarantees);
    if(status==='pass'&&invalid.length){status='fail';summary='总数虽为'+expected+'，但明确提出的取法不能保证目标配对。';}
    const contradictory=new RegExp(expected+'\\s*(?:颗|个|粒)?\\s*(?:不够|不足|无法保证|不能保证)');
    if(status==='pass'&&applicable.some(clause=>contradictory.test(clause))){status='review';summary='回答包含相互矛盾的保证结论，暂记为不确定。'}
    const strategies=spec?.strategies||[{round:9,star:12}];
    return {task:'candy',status,label:labels[status],summary,answers,finalAnswer,expected,schemes,ignoredConditionalAnswers:[...new Set(ignored)],referenceMatch:new RegExp('(^|[^0-9])'+expected+'([^0-9]|$)').test(clean),
      checks:[{label:'最终最少总数'+expected,state:finalAnswer===expected?'yes':status==='fail'?'no':'unknown'},{label:'可识别取法能保证配对',state:invalid.length?'no':valid.length?'yes':'unknown'},{label:'完整最小性证明',state:'unknown'}],
      standard:spec?.variant==='varied'?'对所有圆形与五角星数量组合检查最坏情况，得到'+expected+'颗。可用方案：'+strategies.map(s=>s.round+'颗圆形＋'+s.star+'颗五角星形').join('；'):standard,
      note:'结论由文本规则识别；识别到的取法通过组合枚举校验，不声称已经验证完整数学证明。'};
  }

  function extractArtifact(text) {
    const raw = String(text || '').trim();
    const blocks = [...raw.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)].map(m => m[1].trim());
    const code = blocks.find(b => /<svg(?:\s|>)/i.test(b)) || raw;
    const begin = code.search(/<!doctype\s+html|<html(?:\s|>)|<svg(?:\s|>)/i);
    if (begin < 0) return '';
    let artifact = code.slice(begin);
    const htmlEnd = artifact.toLowerCase().lastIndexOf('</html>');
    if (htmlEnd >= 0) return artifact.slice(0, htmlEnd + 7);
    if (/^<svg[\s>]/i.test(artifact)) { const end = artifact.toLowerCase().lastIndexOf('</svg>'); if (end >= 0) artifact = artifact.slice(0, end + 6); }
    return artifact;
  }
  function pelican(text) {
    const artifact = extractArtifact(text);
    const html = /<!doctype\s+html|<html(?:\s|>)/i.test(artifact) && /<\/html>/i.test(artifact);
    const svg = /<svg(?:\s|>)/i.test(artifact) && /<\/svg>/i.test(artifact);
    const motion = /<animate(?:Transform|Motion)?[\s/>]|@(?:-webkit-)?keyframes|requestAnimationFrame\s*\(|setInterval\s*\(|\.animate\s*\(/i.test(artifact);
    const external = /(?:src|href)\s*=\s*["'](?:https?:)?\/\/|(?:fetch|import)\s*\(|url\s*\(\s*["']?(?:https?:)?\/\//i.test(artifact);
    const status = html && svg && motion ? 'artifact' : 'review';
    return { task: 'pelican', status, label: labels[status], summary: status === 'artifact' ? '已提取HTML、SVG与动画代码，实际效果由自动视觉评审判断。' : '作品结构不完整或没有动画线索，渲染结果另行记录。', checks: [
      { label: '完整HTML文档', state: html ? 'yes' : 'no' },
      { label: '包含SVG画面', state: svg ? 'yes' : 'no' },
      { label: '包含动画代码', state: motion ? 'hint' : 'unknown' },
      { label: '外部资源引用', state: external ? 'hint' : 'none' }
    ], artifact, note: '只检查代码结构，不自动判断画质、鸟类外观或运动合理性。预览使用隔离沙箱，并限制外部资源加载。' };
  }
  function judge(task, text,spec) { if (task !== 'candy' && task !== 'pelican') throw new Error('未知题目'); return task === 'candy' ? candy(text,spec) : pelican(text); }
  function extractResponse(payload) {
    if (typeof payload.output_text === 'string') return payload.output_text;
    if (Array.isArray(payload.output)) {
      return payload.output.filter(x => x.type === 'message').flatMap(x => x.content || []).filter(x => x.type === 'output_text' || x.type === 'text' || x.type === 'refusal').map(x => x.text || x.refusal || '').join('\n');
    }
    const message = payload.choices?.[0]?.message;
    if (typeof message?.content === 'string') return message.content;
    if (Array.isArray(message?.content)) return message.content.filter(x => x.type === 'text').map(x => x.text || '').join('\n');
    return message?.refusal || '';
  }
  return { VERSION, prompts, standard, labels, judge, extractArtifact, extractResponse };
});

return module.exports;
})();
const Transport = (() => {
const module = { exports: {} };
const require = () => Core;
/* MIT License, Copyright (c) 2026 Onward0131 and contributors. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.cjs'));
  else root.ModelProbeTransport = factory(root.ModelProbe);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
'use strict';
function endpointOf(baseUrl, protocol = 'chat') {
  let url;
  try { url = new URL(String(baseUrl || '').trim()); } catch { throw new Error('请输入有效的API地址。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API地址仅支持HTTP/HTTPS，不能包含账号、查询参数或片段。');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('远程API必须使用HTTPS；本机接口可以使用HTTP。');
  const suffix = protocol === 'responses' ? '/responses' : '/chat/completions';
  let p = url.pathname.replace(/\/+$/, '');
  if (/\/(?:chat\/completions|responses)$/.test(p)) p = p.replace(/\/(?:chat\/completions|responses)$/, '');
  if (!p) p = '/v1';
  url.pathname = p + suffix;
  return url.toString();
}
function getConfig(input) {
  if (!['candy', 'pelican'].includes(input.task)) throw new Error('请选择糖果题或鹈鹕题。');
  const model = String(input.model || '').trim();
  if (!model || model.length > 200) throw new Error('请输入接口提供的模型名称。');
  const key = String(input.apiKey || '').trim();
  if (/[\r\n]/.test(key) || key.length > 4096) throw new Error('API Key格式无效。');
  const protocol = input.protocol === 'responses' ? 'responses' : 'chat';
  const endpoint = endpointOf(input.baseUrl, protocol);
  const tokens = Number(input.maxTokens || 8192);
  if (!Number.isInteger(tokens) || tokens < 256 || tokens > 65536) throw new Error('输出上限须为256～65536的整数。');
  const timeout = Number(input.timeout || 180);
  if (!Number.isFinite(timeout) || timeout < 10 || timeout > 600) throw new Error('超时须为10～600秒。');
  const effort = String(input.reasoning || '');
  if (!['', 'low', 'medium', 'high'].includes(effort)) throw new Error('思考强度设置无效。');
  return { task: input.task, model, key, protocol, endpoint, tokens, timeout, effort };
}
async function readLimited(response, limit = 8 * 1024 * 1024) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) throw new Error('接口响应超过8MB，已停止读取。');
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Both protocols use SSE, but only explicit terminal events complete a Responses stream.
async function readEventStream(response, onProgress) {
  if (!response.body) throw new Error('接口未返回响应正文。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', answer = '', total = 0, completed = false, responses = false;
  const payload = { choices: [{ message: { content: '' }, finish_reason: null }] };
  const event = block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { if (!responses) completed = true; return; }
    let chunk;
    try { chunk = JSON.parse(data); } catch { throw new Error('接口流式响应格式不正确。'); }
    if (chunk.error || ['error', 'response.failed', 'response.error'].includes(chunk.type)) throw new Error('接口在生成途中返回错误。');
    if (chunk.type?.startsWith('response.')) {
      responses = true;
      const info = chunk.response;
      if (info) {
        for (const key of ['model', 'service_tier', 'system_fingerprint', 'usage']) if (info[key] != null) payload[key] = info[key];
        if (['response.completed', 'response.incomplete'].includes(chunk.type)) {
          completed = true;
          payload.status = chunk.type === 'response.completed' ? 'completed' : 'incomplete';
          if (info.error) throw new Error('接口在生成途中返回错误。');
          const full = Core.extractResponse(info);
          if (full) answer = full;
        }
      }
      if (['response.output_text.delta', 'response.refusal.delta'].includes(chunk.type) && typeof chunk.delta === 'string') answer += chunk.delta;
    } else {
      for (const key of ['model', 'service_tier', 'system_fingerprint', 'usage']) if (chunk[key] != null) payload[key] = chunk[key];
      for (const choice of chunk.choices || []) {
        if (choice.index && choice.index !== 0) continue;
        if (typeof choice.delta?.content === 'string') answer += choice.delta.content;
        if (typeof choice.delta?.refusal === 'string') answer += choice.delta.refusal;
        if (choice.finish_reason) payload.choices[0].finish_reason = choice.finish_reason;
      }
    }
    if (answer) onProgress?.(answer.length);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      total += value.byteLength;
      if (total > 8 * 1024 * 1024) throw new Error('接口流式响应超过8MB。');
      buffer += decoder.decode(value, { stream: true });
      let split;
      while ((split = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, split.index)); buffer = buffer.slice(split.index + split[0].length);
      }
      if (completed) break;
    }
    if (buffer.trim()) event(buffer);
    if (!completed && (responses || !payload.choices[0].finish_reason)) payload.status = 'incomplete';
    payload.choices[0].message.content = answer;
    return payload;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function runProbe(input, signal) {
  const config = getConfig(input);
  const started = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), config.timeout * 1000);
  const headers = { 'Content-Type': 'application/json' };
  if (config.key) headers.Authorization = 'Bearer ' + config.key;
  const body = config.protocol === 'responses'
    ? { model: config.model, input: [{ role: 'user', content: input.taskSpec?.prompt || Core.prompts[config.task] }], max_output_tokens: config.tokens, stream: true }
    : { model: config.model, messages: [{ role: 'user', content: input.taskSpec?.prompt || Core.prompts[config.task] }], stream: true, stream_options: { include_usage: true } };
  if (config.protocol === 'chat') body[input.tokenField === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens'] = config.tokens;
  if (config.effort) { if (config.protocol === 'responses') body.reasoning = { effort: config.effort }; else body.reasoning_effort = config.effort; }
  try {
    const response = await (input.fetchImpl || globalThis.fetch)(config.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    const firstByteMs=Date.now()-started;
    let firstTokenMs=null;
    if (!response.ok) {
      await response.body?.cancel();
      const tips = { 400: '请求参数不被接口接受，可尝试更换输出上限字段或关闭思考强度。', 401: '密钥无效或已失效。', 403: '接口拒绝访问，请检查权限。', 404: '接口路径或模型名称不存在。', 429: '接口限流或额度不足。' };
      const failure=new Error('接口返回HTTP ' + response.status + '。' + (tips[response.status] || '请检查提供商的服务状态。'));
      failure.statusCode=response.status;failure.retryable=[408,429,500,502,503,504].includes(response.status);
      const retryAfter=response.headers.get('retry-after');failure.retryAfterMs=Math.min(60000,Math.max(0,/^\d+$/.test(retryAfter||'')?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()||0));
      throw failure;
    }
    let payload;
    if (/text\/event-stream/i.test(response.headers.get('content-type') || '')) payload = await readEventStream(response,chars=>{firstTokenMs??=Date.now()-started;input.onProgress?.({chars,firstTokenMs})});
    else { const raw = await readLimited(response); try { payload = JSON.parse(raw); } catch { throw new Error('接口未返回有效JSON，请检查API地址和协议。'); } }
    const answer = Core.extractResponse(payload);
    if (!answer.trim()) throw new Error('接口没有返回可判定的正文，可能仅返回了思考内容或输出额度耗尽。');
    const judgment = Core.judge(config.task, answer,input.taskSpec);
    const finish = payload.choices?.[0]?.finish_reason || payload.status || null;
    const truncated = finish === 'length' || payload.status === 'incomplete';
    if (truncated) { judgment.status = 'review'; judgment.label = Core.labels.review; judgment.summary = '输出被接口截断，请增加输出上限后重试；当前回答仅供复核。'; }
    return { id: globalThis.crypto.randomUUID(), timestamp: new Date().toISOString(), task: config.task, model: config.model, returnedModel: payload.model || null, systemFingerprint:payload.system_fingerprint||null,requestId:response.headers.get('x-request-id')||null,firstByteMs,firstTokenMs,protocol: config.protocol, endpoint: config.endpoint, reasoning: config.effort || 'provider-default', serviceTier: payload.service_tier || null, elapsedMs: Date.now() - started, usage: payload.usage || null, finishReason: finish, source: 'api', answer, judgment,taskSpec:input.taskSpec||null,rulesVersion: Core.VERSION };
  } catch (error) {
    if (controller.signal.aborted){const failure=new Error(signal?.aborted ? '请求已取消。' : '请求超过' + config.timeout + '秒，已停止等待。');failure.retryable=!signal?.aborted;failure.code=signal?.aborted?'CANCELLED':'TIMEOUT';throw failure;}
    if (error instanceof TypeError){const failure=new Error('无法连接API，请检查地址、网络和证书。');failure.retryable=true;failure.code='NETWORK';throw failure;}
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

return { runProbe, getConfig, endpointOf, readEventStream, readChatStream: readEventStream, readLimited };
});

return module.exports;
})();
const Preview = (() => {
const module = { exports: {} };

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ModelProbePreview = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WIDTH = 1200, HEIGHT = 800;
function sceneDocument(source) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none';";
  const cleaned = String(source).replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
  const bridge = '<script>(()=>{let paused=false,delay=0,at=0;const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(function next(t){if(paused){raf(next);return}fn(t-delay)});addEventListener("message",e=>{if(e.source!==parent||e.data?.type!=="probe-playback")return;const next=e.data.paused===true;if(next===paused)return;if(next)at=performance.now();else delay+=performance.now()-at;paused=next;document.querySelectorAll("*").forEach(el=>{el.style.animationPlayState=paused?"paused":"running"});document.querySelectorAll("svg").forEach(el=>{try{paused?el.pauseAnimations():el.unpauseAnimations()}catch{}})});})();</script>';
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=1200"><meta http-equiv="Content-Security-Policy" content="' + policy + '">' + bridge + cleaned + '<style>html,body{overflow:hidden!important}body{margin:0}a,form{pointer-events:none}</style>';
}
function playerDocument(source, controls = false) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>鹈鹕动画播放器</title><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#edf2f0}#stage{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}#scene{width:1200px;height:800px;border:0;transform-origin:0 0;position:absolute;left:50%;top:50%;background:#fff}#bar{position:absolute;z-index:2;top:15px;right:15px;display:flex;gap:8px}button{padding:9px 13px;background:#102521e8;color:white;border:1px solid #ffffff3b;border-radius:7px;cursor:pointer;font:14px system-ui}</style></head><body><div id="stage"><iframe id="scene" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="' + escapeHtml(sceneDocument(source)) + '"></iframe></div>' + (controls ? '<div id="bar"><button id="toggle">暂停</button><button id="replay">重播</button><button id="full">全屏</button></div>' : '') + '<script>(()=>{const f=document.getElementById("scene"),stage=document.getElementById("stage");let paused=false,mode="fit";const fit=()=>{const scale=mode==="fill"?Math.max(stage.clientWidth/1200,stage.clientHeight/800):Math.min(stage.clientWidth/1200,stage.clientHeight/800);f.style.transform="translate(-50%,-50%) scale("+scale+")";f.style.transformOrigin="center center"};new ResizeObserver(fit).observe(stage);fit();const action=data=>{if(data.action==="pause"){paused=data.paused;f.contentWindow.postMessage({type:"probe-playback",paused},"*")}if(data.action==="replay"){f.srcdoc=f.srcdoc;paused=false}if(data.action==="fit"){mode=data.mode;fit()}};addEventListener("message",e=>{if(e.source===parent&&e.data?.type==="probe-player")action(e.data)});const toggle=document.getElementById("toggle");if(toggle){toggle.onclick=()=>{action({action:"pause",paused:!paused});toggle.textContent=paused?"播放":"暂停"};document.getElementById("replay").onclick=()=>{action({action:"replay"});toggle.textContent="暂停"};document.getElementById("full").onclick=()=>document.documentElement.requestFullscreen()}})();</script></body></html>';
}
return { sceneDocument, playerDocument, WIDTH, HEIGHT };

});

return module.exports;
})();

export const { VERSION, prompts, standard, labels, judge, extractArtifact, extractResponse } = Core;
export const { runProbe, endpointOf, readEventStream, readLimited } = Transport;
export const { sceneDocument, playerDocument } = Preview;
