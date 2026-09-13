'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const wrap = (name, file, dependency = '') => `const ${name} = (() => {\nconst module = { exports: {} };\n${dependency}\n${read(file)}\nreturn module.exports;\n})();\n`;
const source = '/* Generated from core.cjs, transport.cjs and preview.cjs. MIT; see LICENSE. */\n'
  + wrap('Core', 'core.cjs')
  + wrap('Transport', 'transport.cjs', "const require = () => Core;")
  + wrap('Preview', 'preview.cjs')
  + '\nexport const { VERSION, prompts, standard, labels, judge, extractArtifact, extractResponse } = Core;\n'
  + 'export const { runProbe, endpointOf, readEventStream, readLimited } = Transport;\n'
  + 'export const { sceneDocument, playerDocument } = Preview;\n';
const output = path.join(root, 'browser/model-probe.mjs');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || read('browser/model-probe.mjs') !== source) throw Error('Browser SDK is outdated. Run npm run build.');
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, source);
}
console.log('Browser SDK is reproducible and uses the standalone judging and transport code.');
