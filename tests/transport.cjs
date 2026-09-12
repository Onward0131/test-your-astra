'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Transport = require('../transport.cjs');
const input = { baseUrl: 'https://example.invalid/v1', apiKey: 'fixture-key', model: 'mock', task: 'candy', protocol: 'responses', reasoning: 'high' };
const sse = events => new Response(events.map(event => 'data: ' + (typeof event === 'string' ? event : JSON.stringify(event)) + '\r\n\r\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
(async () => {
  let request;
  const events = [
    { type: 'response.created', response: { model: 'reported-mock', service_tier: 'priority' } },
    { type: 'response.output_text.delta', delta: '最终答案21颗。' },
    { type: 'response.completed', response: { status: 'completed', model: 'reported-mock', usage: { input_tokens: 8, output_tokens: 4 }, output: [{ type: 'message', content: [{ type: 'output_text', text: '最终答案21颗。' }] }] } },
  ];
  const record = await Transport.runProbe({ ...input, fetchImpl: async (url, options) => { request = { url, options }; return sse(events); } });
  assert.equal(record.judgment.status, 'pass');
  assert.equal(record.returnedModel, 'reported-mock');
  assert.equal(record.serviceTier, 'priority');
  assert.equal(record.usage.output_tokens, 4);
  assert.equal(record.answer, '最终答案21颗。');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.parse(request.options.body).stream, true);
  assert(!JSON.stringify(record).includes(input.apiKey));
  const partial = await Transport.runProbe({ ...input, fetchImpl: async () => sse(events.slice(0, 2).concat('[DONE]')) });
  assert.equal(partial.judgment.status, 'review');
  assert.equal(partial.finishReason, 'incomplete');
  await assert.rejects(Transport.runProbe({ ...input, fetchImpl: async () => sse([{ type: 'response.failed', response: { error: { message: 'secret upstream detail' } } }]) }), /生成途中/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(Transport.runProbe({ ...input, fetchImpl: async (_url, options) => { options.signal.throwIfAborted(); } }, controller.signal), error => error.code === 'CANCELLED');
  await assert.rejects(Transport.readLimited(new Response('12345'), 4), /8MB/);
  const chat = await Transport.runProbe({ ...input, protocol: 'chat', fetchImpl: async () => sse([{ choices: [{ delta: { content: '最终答案21颗。' }, finish_reason: 'stop' }] }, '[DONE]']) });
  assert.equal(chat.judgment.status, 'pass');
  const sdk = await import(pathToFileURL(path.join(__dirname, '../browser/model-probe.mjs')));
  assert.equal(sdk.judge('candy', '最终答案29颗。').status, 'fail');
  assert.equal((await sdk.runProbe({ ...input, fetchImpl: async () => sse(events) })).judgment.status, 'pass');
  const sandbox = vm.createContext({});
  for (const file of ['core.cjs', 'transport.cjs', 'preview.cjs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  assert.equal(sandbox.ModelProbe.judge('candy', '21').status, 'pass');
  assert.equal(typeof sandbox.ModelProbeTransport.runProbe, 'function');
  assert(sdk.playerDocument('<svg/>').includes('sandbox="allow-scripts"'));
  assert(sdk.sceneDocument('<base href="https://example.invalid"><svg/>').includes("connect-src 'none'"));
  console.log('Chat/Responses, terminal events, cancellation, bounded reads, metadata and browser SDK passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
