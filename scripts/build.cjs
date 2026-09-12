'use strict';
require('./build-browser.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
const html=read('src/tool.template.html')
  .replace('/*__CORE__*/',()=>read('core.cjs'))
  .replace('/*__APP__*/',()=>read('src/app.js'));
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
if(process.argv.includes('--check')){
  if(read('tool.html')!==html)throw Error('tool.html is outdated. Run npm run build and commit the result.');
  console.log('Frontend build is reproducible; inline scripts parse.');
}else{
  fs.writeFileSync(path.join(root,'tool.html'),html);
  console.log('Built tool.html from src/ and core.cjs.');
}
