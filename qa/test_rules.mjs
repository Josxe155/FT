import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc as rawSetDoc,writeBatch,getDoc,updateDoc,collection,query,where,orderBy,limit,getDocs,getCountFromServer,serverTimestamp as fsTime} from 'firebase/firestore';
import {ref,set,get,remove,serverTimestamp as rtTime} from 'firebase/database';
// Identidad ficticia solo en las reglas cargadas dentro del emulador de QA.
const qaRules=path=>readFileSync(path,'utf8').replace(/'[^'\n]*@[^'\n]*'/g,"'admin@example.test'");
const env=await initializeTestEnvironment({projectId:'demo-funados-security',firestore:{host:'127.0.0.1',port:8086,rules:qaRules('firestore.rules')},database:{host:'127.0.0.1',port:9000,rules:qaRules('database.rules.json')}});
const a=env.authenticatedContext('alice'),b=env.authenticatedContext('bob'),anon=env.unauthenticatedContext();
// Cada caso de esquema se aísla con una ventana nueva; el límite real se prueba en test_publish_limits.mjs.
async function setDoc(ref,data,...options){
 if(ref.parent.id!=='reports')return rawSetDoc(ref,data,...options);
 const db=ref.firestore,uid=ref.path==='reports/spoof'?'bob':'alice';
 await env.withSecurityRulesDisabled(async c=>{await rawSetDoc(doc(c.firestore(),'publishLimits',uid),{count:0,windowStartedAt:fsTime(),updatedAt:fsTime(),lastReportId:'fixture-old'});});
 const batch=writeBatch(db);
 batch.set(doc(db,'publishLimits',uid),{count:1,windowStartedAt:(await getDoc(doc(db,'publishLimits',uid))).data().windowStartedAt,updatedAt:fsTime(),lastReportId:ref.id});
 batch.set(ref,data);return batch.commit();
}
const report={id:'test-report',canton:'machala',title:'Reporte de prueba seguro',description:'Descripción técnica de una prueba aislada de permisos.',category:'Funa',status:'approved',authorUid:'alice',authorAlias:'Anónimo',createdAt:fsTime(),images:[],media:[],sensitiveContent:false};
try{
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/test-report'),report));
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/with-media'),{...report,id:'with-media',media:[{id:'0',ownerUid:'alice',name:'x.png',type:'image/png',size:3,chunks:1}]}));
 await assertFails(setDoc(doc(a.firestore(),'reports/text-sensitive'),{...report,id:'text-sensitive',sensitiveContent:true}));
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/photo-sensitive'),{...report,id:'photo-sensitive',sensitiveContent:true,media:[{id:'0',ownerUid:'alice',name:'photo.png',type:'image/png',size:3,chunks:1}]}));
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/video-sensitive'),{...report,id:'video-sensitive',sensitiveContent:true,media:[{id:'0',ownerUid:'alice',name:'video.webm',type:'video/webm',size:3,chunks:1}]}));
 for(const [id,values] of [['large-image',{size:6*1024*1024,chunks:128}]]){
  await assertFails(setDoc(doc(a.firestore(),'reports/'+id),{...report,id,media:[{id:'0',ownerUid:'alice',name:'photo.png',type:'image/png',size:3,chunks:1,...values}]}));
 }
 console.log('PASS: sensibilidad exige multimedia y tamaños limitados');
 console.log('PASS: una evidencia');
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/ten-media'),{...report,id:'ten-media',media:Array.from({length:10},(_,i)=>({id:String(i),ownerUid:'alice',name:'x.png',type:'image/png',size:3,chunks:1}))}));
 console.log('PASS: diez evidencias');
 await assertFails(getDoc(doc(anon.firestore(),'reports/test-report')));
 await assertSucceeds(getDoc(doc(b.firestore(),'reports/test-report')));
 await assertFails(setDoc(doc(b.firestore(),'reports/spoof'),{...report,id:'spoof'}));
 await assertFails(updateDoc(doc(a.firestore(),'reports/test-report'),{authorUid:'bob'}));
 await assertFails(updateDoc(doc(a.firestore(),'reports/test-report'),{status:'rejected'}));
 await assertFails(updateDoc(doc(a.firestore(),'reports/test-report'),{title:'x'.repeat(2000)}));
 await assertFails(updateDoc(doc(a.firestore(),'reports/test-report'),{createdAt:fsTime()}));
 await assertFails(setDoc(doc(a.firestore(),'reports/missing-title'),Object.fromEntries(Object.entries({...report,id:'missing-title'}).filter(([key])=>key!=='title'))));
 await assertFails(setDoc(doc(a.firestore(),'flags/test-report_post_alice'),{reportId:'test-report',replyId:'post',reason:'Acoso',details:'x'.repeat(501),reporterUid:'alice',createdAt:fsTime()}));
 await assertFails(setDoc(doc(a.firestore(),'reports/bad-media'),{...report,id:'bad-media',media:[{id:'0',ownerUid:'bob',name:'x',type:'image/png',size:4,chunks:1}]}));
 await assertFails(setDoc(doc(a.firestore(),'reports/bad-size'),{...report,id:'bad-size',media:[{id:'0',ownerUid:'alice',name:'x',type:'image/png',size:999999999,chunks:1}]}));
 await assertFails(setDoc(doc(a.firestore(),'profiles/alice'),{uid:'alice',alias:'Anónimo',tiktokUsername:'valid_name',tiktokVerified:true,updatedAt:fsTime()}));
 await assertSucceeds(setDoc(doc(a.firestore(),'profiles/alice'),{uid:'alice',alias:'Anónimo',tiktokUsername:'valid_name',tiktokVerified:false,updatedAt:fsTime()}));
 await assertFails(updateDoc(doc(a.firestore(),'profiles/alice'),{tiktokUsername:'bad link /'}));
 await assertSucceeds(setDoc(doc(a.firestore(),'userPrefs/alice'),{uid:'alice',alias:'Apodo privado',updatedAt:fsTime()}));
 await assertFails(getDoc(doc(b.firestore(),'userPrefs/alice')));
 await assertFails(getDoc(doc(anon.firestore(),'userPrefs/alice')));
 console.log('PASS privacidad: apodos no legibles por otras cuentas ni sin sesión');
 await assertFails(setDoc(doc(b.firestore(),'profiles/alice'),{uid:'alice',alias:'Anónimo',tiktokUsername:'valid_name',tiktokVerified:false,updatedAt:fsTime()}));
 const photo={id:'0',ownerUid:'alice',name:'photo.png',type:'image/png',size:3,chunks:1};
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/test-report/updates/photos'),{reportId:'test-report',text:'Actualización válida con fotografías.',authorUid:'alice',createdAt:fsTime(),media:Array.from({length:4},(_,i)=>({...photo,id:String(i)}))}));
 await assertSucceeds(setDoc(doc(a.firestore(),'reports/test-report/updates/photo-only'),{reportId:'test-report',text:'',authorUid:'alice',createdAt:fsTime(),media:[photo]}));
 await assertFails(setDoc(doc(a.firestore(),'reports/test-report/updates/empty'),{reportId:'test-report',text:'',authorUid:'alice',createdAt:fsTime(),media:[]}));
 // El contador usa agregación del servidor y el hilo carga las últimas 100 novedades.
 const updatesQuery=query(collection(b.firestore(),'reports/test-report/updates'));
 await assertSucceeds(getCountFromServer(updatesQuery));
 await assertSucceeds(getDocs(query(collection(b.firestore(),'reports/test-report/updates'),orderBy('createdAt','desc'),limit(100))));
 await assertFails(getCountFromServer(query(collection(anon.firestore(),'reports/test-report/updates'))));
 console.log('PASS: contador y novedades recientes autorizados; sin sesión denegados');
 const commentQuery=query(collection(b.firestore(),'reports/test-report/replies'),where('status','==','approved'));
 await env.withSecurityRulesDisabled(async context=>{
  await setDoc(doc(context.firestore(),'reports/test-report/replies/count-root'),{reportId:'test-report',text:'Comentario aprobado',authorUid:'alice',status:'approved',createdAt:fsTime()});
  await setDoc(doc(context.firestore(),'reports/test-report/replies/count-child'),{reportId:'test-report',text:'Respuesta aprobada',authorUid:'alice',status:'approved',parentId:'count-root',createdAt:fsTime()});
  await setDoc(doc(context.firestore(),'reports/test-report/replies/count-hidden'),{reportId:'test-report',text:'Comentario retirado',authorUid:'alice',status:'rejected',createdAt:fsTime()});
 });
 const counted=await assertSucceeds(getCountFromServer(commentQuery));
 if(counted.data().count!==2)throw Error('El contador debe incluir respuestas y excluir retirados');
 await assertFails(getCountFromServer(query(collection(anon.firestore(),'reports/test-report/replies'),where('status','==','approved'))));
 console.log('PASS: contador de comentarios, respuestas incluidas, retirados excluidos y sin sesión denegado');

 await assertFails(setDoc(doc(b.firestore(),'reports/test-report/updates/forged'),{reportId:'test-report',text:'Un tercero no puede suplantar al autor.',authorUid:'bob',createdAt:fsTime(),media:[]}));
 await assertFails(setDoc(doc(a.firestore(),'reports/test-report/updates/too-many'),{reportId:'test-report',text:'Una actualización con demasiadas fotos.',authorUid:'alice',createdAt:fsTime(),media:Array.from({length:5},(_,i)=>({...photo,id:String(i)}))}));
 await assertFails(setDoc(doc(a.firestore(),'reports/test-report/updates/large-photo'),{reportId:'test-report',text:'Fotos de actualización limitadas a cinco megabytes.',authorUid:'alice',createdAt:fsTime(),media:[{...photo,size:6*1024*1024,chunks:128}]}));
 await assertFails(setDoc(doc(a.firestore(),'reports/test-report/updates/video'),{reportId:'test-report',text:'Solo se admiten fotos en actualizaciones.',authorUid:'alice',createdAt:fsTime(),media:[{...photo,type:'video/mp4'}]}));
 await assertSucceeds(set(ref(a.database(),'evidenceUpdates/alice/test-report/photos/files/0/meta'),{...photo,createdAt:rtTime()}));
 await assertSucceeds(set(ref(a.database(),'evidenceUpdates/alice/test-report/photos/files/0/chunks/0'),'YWJj'));
 await assertFails(set(ref(a.database(),'evidenceUpdates/alice/test-report/photos/files/4/meta'),{...photo,id:'4',createdAt:rtTime()}));
 await assertFails(set(ref(a.database(),'evidenceUpdates/alice/test-report/photos/files/1/meta'),{...photo,id:'1',type:'video/mp4',createdAt:rtTime()}));
 await assertFails(get(ref(b.database(),'evidenceUpdates/alice/test-report/photos')));
 await assertSucceeds(set(ref(a.database(),'evidenceVisibility/alice/test-report'),{ownerUid:'alice',visible:true}));
 await assertSucceeds(get(ref(b.database(),'evidenceUpdates/alice/test-report/photos')));
 await env.withSecurityRulesDisabled(async c=>{await set(ref(c.database(),'blockedEvidence/test-report'),true);});
 await assertFails(get(ref(b.database(),'evidenceUpdates/alice/test-report/photos')));
 await env.withSecurityRulesDisabled(async c=>{await remove(ref(c.database(),'blockedEvidence/test-report'));await remove(ref(c.database(),'evidenceVisibility/alice/test-report'));});
 await assertSucceeds(set(ref(a.database(),'activity/alice'),{lastActiveAt:rtTime()}));
 const moderator=env.authenticatedContext('moderator',{email:'admin@example.test',email_verified:true});
 const unverified=env.authenticatedContext('not-moderator',{email:'admin@example.test',email_verified:false});
 await assertSucceeds(get(ref(moderator.database(),'activity')));
 await assertFails(get(ref(b.database(),'activity')));
 await assertFails(get(ref(unverified.database(),'activity')));
 await assertFails(set(ref(b.database(),'activity/alice'),{lastActiveAt:rtTime()}));
 await assertFails(set(ref(a.database(),'activity/alice'),{lastActiveAt:1}));
 await assertFails(set(ref(a.database(),'activity/alice'),{lastActiveAt:rtTime(),admin:true}));
 const path='evidence/alice/test-report/files/0';
 const meta={id:'0',ownerUid:'alice',name:'test.png',type:'image/png',size:3,chunks:1,createdAt:rtTime()};
 await assertSucceeds(set(ref(a.database(),path+'/meta'),meta));
 await assertSucceeds(set(ref(a.database(),path+'/chunks/0'),'YWJj'));
 await assertFails(set(ref(b.database(),path+'/chunks/1'),'YWJj'));
 await assertFails(set(ref(a.database(),'evidence/alice/invalid/files/0/meta'),{...meta,extra:'arbitrary'}));
 await assertFails(get(ref(anon.database(),path)));
 await assertFails(set(ref(b.database(),'evidenceVisibility/alice/test-report'),{ownerUid:'alice',visible:true}));
 await assertSucceeds(set(ref(b.database(),'evidence/bob/test-report/files/0/meta'),{...meta,ownerUid:'bob'}));
 await assertSucceeds(set(ref(b.database(),'evidenceVisibility/bob/test-report'),{ownerUid:'bob',visible:true}));
 await assertFails(get(ref(b.database(),path)));
 await env.withSecurityRulesDisabled(async c=>{await set(ref(c.database(),'evidenceVisibility/alice/test-report'),{ownerUid:'alice',visible:true});});
 await assertSucceeds(get(ref(b.database(),path)));
 await assertSucceeds(remove(ref(a.database(),'evidence/alice/test-report')));
 await assertFails(set(ref(a.database(),'visits/alice'),{firstSeen:1}));
 await assertSucceeds(set(ref(a.database(),'visits/alice'),{firstSeen:rtTime()}));
 await assertFails(set(ref(a.database(),'visits/alice'),{firstSeen:rtTime()}));
 await assertFails(get(ref(b.database(),'visits')));
 console.log('PASS: reglas, autoría, metadatos, tamaños, perfiles, visibilidad, limpieza y visitas');
}finally{await env.cleanup();}
