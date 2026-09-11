#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const Core = require('./core.cjs');
const DEFAULTS = { baseUrl: '', model: 'gpt-6-astra', protocol: 'chat', reasoning: 'medium', maxTokens: 16384, timeout: 600, tokenField: 'max_completion_tokens' };
let sessionKey = process.env.MODEL_PROBE_API_KEY || '';
delete process.env.MODEL_PROBE_API_KEY;

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
  const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new Error('接口响应超过8MB，已停止读取。'); chunks.push(Buffer.from(value)); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
async function readChatStream(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', answer = '', total = 0, completed = false;
  const payload = { choices: [{ message: { content: '' }, finish_reason: null }] };
  const event = block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { completed = true; return; }
    let chunk; try { chunk = JSON.parse(data); } catch { throw new Error('接口流式响应格式不正确。'); }
    if (chunk.error) throw new Error('接口在生成途中返回错误。');
    if (chunk.model) payload.model = chunk.model;
    if (chunk.service_tier) payload.service_tier = chunk.service_tier;
    if (chunk.system_fingerprint) payload.system_fingerprint = chunk.system_fingerprint;
    if (chunk.usage) payload.usage = chunk.usage;
    for (const choice of chunk.choices || []) {
      if (choice.index && choice.index !== 0) continue;
      if (typeof choice.delta?.content === 'string') answer += choice.delta.content;
      if (typeof choice.delta?.refusal === 'string') answer += choice.delta.refusal;
      if (choice.finish_reason) payload.choices[0].finish_reason = choice.finish_reason;
    }
    if(answer)onProgress?.(answer.length);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      total += value.length; if (total > 8 * 1024 * 1024) throw new Error('接口流式响应超过8MB。');
      buffer += decoder.decode(value, { stream: true });
      let split; while ((split = /\r?\n\r?\n/.exec(buffer))) { event(buffer.slice(0, split.index)); buffer = buffer.slice(split.index + split[0].length); }
      if (completed) break;
    }
    if (buffer.trim()) event(buffer);
    if (!completed && !payload.choices[0].finish_reason) payload.status = 'incomplete';
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
    ? { model: config.model, input: [{ role: 'user', content: input.taskSpec?.prompt || Core.prompts[config.task] }], max_output_tokens: config.tokens, stream: false }
    : { model: config.model, messages: [{ role: 'user', content: input.taskSpec?.prompt || Core.prompts[config.task] }], stream: true, stream_options: { include_usage: true } };
  if (config.protocol === 'chat') body[input.tokenField === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens'] = config.tokens;
  if (config.effort) { if (config.protocol === 'responses') body.reasoning = { effort: config.effort }; else body.reasoning_effort = config.effort; }
  try {
    const response = await fetch(config.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
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
    if (/text\/event-stream/i.test(response.headers.get('content-type') || '')) payload = await readChatStream(response,chars=>{firstTokenMs??=Date.now()-started;input.onProgress?.({chars,firstTokenMs})});
    else { const raw = await readLimited(response); try { payload = JSON.parse(raw); } catch { throw new Error('接口未返回有效JSON，请检查API地址和协议。'); } }
    const answer = Core.extractResponse(payload);
    if (!answer.trim()) throw new Error('接口没有返回可判定的正文，可能仅返回了思考内容或输出额度耗尽。');
    const judgment = Core.judge(config.task, answer,input.taskSpec);
    const finish = payload.choices?.[0]?.finish_reason || payload.status || null;
    const truncated = finish === 'length' || payload.status === 'incomplete';
    if (truncated) { judgment.status = 'review'; judgment.label = Core.labels.review; judgment.summary = '输出被接口截断，请增加输出上限后重试；当前回答仅供复核。'; }
    return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), task: config.task, model: config.model, returnedModel: payload.model || null, systemFingerprint:payload.system_fingerprint||null,requestId:response.headers.get('x-request-id')||null,firstByteMs,firstTokenMs,protocol: config.protocol, endpoint: config.endpoint, reasoning: config.effort || 'provider-default', serviceTier: payload.service_tier || null, elapsedMs: Date.now() - started, usage: payload.usage || null, finishReason: finish, source: 'api', answer, judgment,taskSpec:input.taskSpec||null,rulesVersion: Core.VERSION };
  } catch (error) {
    if (controller.signal.aborted){const failure=new Error(signal?.aborted ? '请求已取消。' : '请求超过' + config.timeout + '秒，已停止等待。');failure.retryable=!signal?.aborted;failure.code=signal?.aborted?'CANCELLED':'TIMEOUT';throw failure;}
    if (error instanceof TypeError){const failure=new Error('无法连接API，请检查地址、网络和证书。');failure.retryable=true;failure.code='NETWORK';throw failure;}
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
function createServer(port) {
  const dataDir=process.env.MODEL_PROBE_DATA_DIR?path.resolve(process.env.MODEL_PROBE_DATA_DIR):undefined;
  return require('./runtime.cjs').serve(port, { dataDir, runProbe, defaults: {...DEFAULTS,baseUrl:process.env.MODEL_PROBE_BASE_URL||DEFAULTS.baseUrl}, sessionKey, validate: getConfig, endpointOf, readChatStream, readLimited });
}function argsOf(values) {
  const args = {};
  for (let i = 0; i < values.length; i++) { const key = values[i]; if (!key.startsWith('--')) throw new Error('参数格式应为--名称 值。'); if (!values[i + 1] || values[i + 1].startsWith('--')) throw new Error(key + '缺少值。'); args[key.slice(2)] = values[++i]; }
  return args;
}
async function main() {
  const command = process.argv[2] || 'serve';
  const args = argsOf(process.argv.slice(3));
  if (command === 'desktop') {
    const open = () => require('node:child_process').spawn('explorer.exe', ['http://127.0.0.1:4317'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    try { const existing = await fetch('http://127.0.0.1:4317/api/config', { signal: AbortSignal.timeout(2000) }); if (existing.ok) { open(); return; } } catch {}
    const server = createServer(4317); server.once('listening', open); return;
  }
  if (command === 'serve') { const port = Number(args.port || 4317); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口须为1024～65535。'); return createServer(port); }
  if (command === 'prompts') return console.log(args.task ? Core.prompts[args.task] || '未知题目' : JSON.stringify(Core.prompts, null, 2));
  let result;
  if (command === 'judge') {
    if (!args.file) throw new Error('需要--file指定回答文本或HTML文件。');
    result = Core.judge(args.task || 'candy', fs.readFileSync(path.resolve(args.file), 'utf8'));
  } else if (command === 'run') {
    result = await runProbe({ ...DEFAULTS, task: args.task || 'candy', model: args.model || DEFAULTS.model, baseUrl: args.base || process.env.MODEL_PROBE_BASE_URL || DEFAULTS.baseUrl, apiKey: sessionKey, protocol: args.protocol || DEFAULTS.protocol, maxTokens: args['max-tokens'] || DEFAULTS.maxTokens, timeout: args.timeout || DEFAULTS.timeout, reasoning: args.reasoning || DEFAULTS.reasoning, tokenField: args['token-field'] || DEFAULTS.tokenField });
  } else throw new Error('支持的命令：desktop、serve、run、judge、prompts。');
  const output = JSON.stringify(result, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), output + '\n', { flag: 'wx' });
  console.log(output);
}
module.exports = { runProbe, createServer, endpointOf, readChatStream, readLimited, judge: Core.judge, prompts: Core.prompts };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
