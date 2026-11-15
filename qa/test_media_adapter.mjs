import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let reads=0,created=0,revoked=0,waiter;
const context=vm.createContext({window:{FUNADOS_FIREBASE_CONFIG:{apiKey:'qa',projectId:'qa'}},console,Blob,Uint8Array,atob,btoa,
 URL:{createObjectURL:()=>`blob:qa-${++created}`,revokeObjectURL:()=>revoked++},
 databaseGet:async()=>{reads++;if(waiter)await waiter;return {val:()=>({'0':'YWJj'})};}
});
const code=readFileSync(new URL('../web/assets/firebase-client.js',import.meta.url),'utf8').replace(/export (async )?function/g,'$1function').replace(/export const/g,'const');
vm.runInContext(code,context);
vm.runInContext('modules={database:{get:databaseGet,ref:(_,path)=>path}};rtdb={};',context);
const item={id:'0',ownerUid:'alice',name:'photo.png',type:'image/png',size:3,chunks:1};
let release;waiter=new Promise(resolve=>release=resolve);
const first=context.loadEvidenceURL('post',item),second=context.loadEvidenceURL('post',item);release();
assert.equal(await first,await second);assert.equal(reads,1,'Miniatura y visor comparten la misma lectura');
waiter=null;
const safe=await context.loadEvidenceURL('unsafe',{...item,localUrl:'javascript:alert(1)'});
assert.match(safe,/^blob:/,'Producción no utiliza URLs locales suministradas por documentos antiguos');
for(let n=0;n<26;n++)await context.loadEvidenceURL('post-'+n,item);
assert.ok(revoked>0,'Las galerías largas liberan los archivos más antiguos');
context.clearEvidenceCache();
const before=created;waiter=new Promise(resolve=>release=resolve);
const stale=context.loadEvidenceURL('private',item);context.clearEvidenceCache();release();
await assert.rejects(stale,/sesión/);assert.equal(created,before,'Una descarga pendiente no repuebla la caché después de cerrar sesión');
console.log('PASS adaptador multimedia: concurrencia, URLs antiguas, límites de caché y cierre de sesión');

let replySnapshot,replyOptions,visibleReplies=[];
context.qaSnapshot=(...args)=>{replyOptions=args[1];replySnapshot=args[2];return ()=>{};};
vm.runInContext('modules={firestore:{query:()=>({}),collection:()=>({}),where:()=>({}),limit:()=>200,onSnapshot:qaSnapshot}};',context);
context.listenReplies('post','alice',list=>visibleReplies=list);
assert.equal(replyOptions.includeMetadataChanges,true);
const pending={id:'pending',metadata:{hasPendingWrites:true},data:()=>({text:'nuevo',createdAt:null})};
replySnapshot({docs:[pending]});assert.equal(visibleReplies.length,0,'Sin escuchas de reacciones antes de confirmar un comentario nuevo');
const confirmed={...pending,metadata:{hasPendingWrites:false},data:()=>({text:'nuevo',createdAt:{toMillis:()=>123}})};
replySnapshot({docs:[confirmed]});assert.equal(visibleReplies.length,1);
replySnapshot({docs:[{...confirmed,metadata:{hasPendingWrites:true}}]});assert.equal(visibleReplies.length,1,'Una edición pendiente no oculta un comentario ya confirmado');
console.log('PASS comentarios: esperar confirmación de creación antes de suscribir reacciones');
