'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),files=[];
function walk(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){
  if(['.git','node_modules','runtime','dist','data','archive','artifacts','.playwright-cli'].includes(item.name))continue;
  const p=path.join(folder,item.name);if(item.isDirectory())walk(p);else files.push(p);
}}
walk(root);
const run=args=>{const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1)};
run(['scripts/build.cjs','--check']);
for(const file of files.filter(f=>/\.(?:cjs|js)$/.test(f)))run(['--check',file]);
const forbidden=new Set(['settings.json','portable-state.json','records.json','queue.json']);
const tracked=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
if(tracked.status===0)for(const name of tracked.stdout.split('\0').filter(Boolean)){
  if(forbidden.has(path.basename(name))||/^(?:artifacts|archive|node_modules|runtime|data)\//.test(name))throw Error('Private/generated file tracked: '+name);
}
let findings=0;
for(const file of files.filter(f=>/\.(?:cjs|js|json|html|md|yml|yaml|ps1|vbs)$/.test(f)&&!forbidden.has(path.basename(f)))){
  const text=fs.readFileSync(file,'utf8');
  if(/sk-[a-zA-Z0-9_-]{24,}|gh[pousr]_[a-zA-Z0-9]{24,}|github_pat_[a-zA-Z0-9_]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))findings++;
}
if(findings)throw Error('Possible credential found in '+findings+' files; values intentionally omitted.');
console.log('Source syntax and publication checks passed.');
