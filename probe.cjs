#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./core.cjs');
const DEFAULTS = { baseUrl: '', model: 'gpt-6-astra', protocol: 'chat', reasoning: 'medium', maxTokens: 16384, timeout: 600, tokenField: 'max_completion_tokens' };
let sessionKey = process.env.MODEL_PROBE_API_KEY || '';
delete process.env.MODEL_PROBE_API_KEY;

const { runProbe, getConfig, endpointOf, readChatStream, readLimited } = require('./transport.cjs');
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
