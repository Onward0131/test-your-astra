'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const name of ['candy','batch','boundary','appearance','server']){
  const result=spawnSync(process.execPath,[path.join(root,'tests',name+'.cjs')],{cwd:root,stdio:'inherit',timeout:60000});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('All offline regression checks passed. No provider API calls.');
