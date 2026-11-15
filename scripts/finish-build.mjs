import {cpSync,copyFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const src=resolve(root,'source');
for(const dir of [resolve(root,'web/assets'),resolve(root,'assets'),resolve(src,'public/assets')])mkdirSync(dir,{recursive:true});
const compiled=resolve(root,'web/assets');
for(const file of ['cantons.js','main.js','entry.js','firebase-client.js','media-ui.js','retention-policy.js']){
  copyFileSync(resolve(compiled,file),resolve(root,'assets',file));
  copyFileSync(resolve(compiled,file),resolve(src,'public/assets',file));
}
for(const dir of [resolve(root,'assets'),resolve(root,'web/assets'),resolve(src,'public/assets')]){
  copyFileSync(resolve(src,'src/styles.css'),resolve(dir,'styles.css'));
  for(const name of ['logo.svg','favicon.svg','icon-192.png','icon-512.png']) copyFileSync(resolve(src,'public/assets',name),resolve(dir,name));
}
copyFileSync(resolve(src,'index.html'),resolve(root,'index.html'));
copyFileSync(resolve(src,'index.html'),resolve(root,'web/index.html'));
copyFileSync(resolve(root,'config.js'),resolve(root,'web/config.js'));
copyFileSync(resolve(root,'config.js'),resolve(src,'public/config.js'));
for (const dir of [resolve(root,'assets'),resolve(root,'web/assets')]) {
  copyFileSync(resolve(src,'src/dashboard.css'),resolve(dir,'dashboard.css'));
  copyFileSync(resolve(src,'src/dashboard.js'),resolve(dir,'dashboard.js'));
  copyFileSync(resolve(src,'src/dashboard-maintenance.js'),resolve(dir,'dashboard-maintenance.js'));
}
copyFileSync(resolve(root,'dashboard.html'),resolve(root,'web/dashboard.html'));
console.log('Construcción lista: index.html, web/index.html y source/public/assets/.');
