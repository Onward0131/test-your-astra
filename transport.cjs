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
