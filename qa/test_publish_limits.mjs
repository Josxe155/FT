import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,deleteDoc,writeBatch,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-funados-security',firestore:{host:'127.0.0.1',port:8086,rules:readFileSync('firestore.rules','utf8')}});
const report=(uid,id)=>({id,canton:'machala',title:'Prueba de límite por hora',description:'Publicación ficticia aislada para verificar el control de abuso.',category:'Funa',status:'approved',authorUid:uid,authorAlias:'Anónimo',createdAt:serverTimestamp(),images:[],media:[]});
async function publish(context,uid,id,override={}){
 const db=context.firestore(),quota=doc(db,'publishLimits',uid);
 return runTransaction(db,async tx=>{
  const previous=(await tx.get(quota)).data();
  const active=previous&&Date.now()<previous.windowStartedAt.toMillis()+3600000;
  tx.set(quota,{count:active?previous.count+1:1,windowStartedAt:active?previous.windowStartedAt:serverTimestamp(),updatedAt:serverTimestamp(),lastReportId:id,...override});
  tx.set(doc(db,'reports',id),report(uid,id));
 });
}
try{
 for(const provider of ['anonymous','google.com']){
  const uid=provider==='anonymous'?'quota-guest':'quota-google';
  const context=env.authenticatedContext(uid,{firebase:{sign_in_provider:provider}});
  for(let i=1;i<=3;i++)await assertSucceeds(publish(context,uid,uid+'-post-'+i));
  await assertFails(publish(context,uid,uid+'-fourth'));
  const quota=doc(context.firestore(),'publishLimits',uid);
  assert.equal((await getDoc(quota)).data().count,3);
  await assertFails(deleteDoc(quota));
  await assertFails(setDoc(quota,{count:0,windowStartedAt:serverTimestamp(),updatedAt:serverTimestamp(),lastReportId:'fake-post'}));
  await assertFails(publish(context,uid,uid+'-reset',{count:1,windowStartedAt:serverTimestamp()}));
  await assertFails(publish(context,uid,uid+'-backdate',{count:1,windowStartedAt:Timestamp.fromMillis(Date.now()-7200000)}));
  // Simula el paso del tiempo solo con el administrador del emulador.
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'publishLimits',uid),{count:3,windowStartedAt:Timestamp.fromMillis(Date.now()-61*60000),updatedAt:Timestamp.now(),lastReportId:uid+'-post-3'});});
  await assertSucceeds(publish(context,uid,uid+'-next-hour'));
  assert.equal((await getDoc(quota)).data().count,1);
 }
 const context=env.authenticatedContext('quota-parallel'),db=context.firestore();
 await assertSucceeds(publish(context,'quota-parallel','quota-parallel-one'));
 await assertSucceeds(publish(context,'quota-parallel','quota-parallel-two'));
 const simultaneous=await Promise.allSettled([publish(context,'quota-parallel','quota-parallel-three'),publish(context,'quota-parallel','quota-parallel-four')]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1,'Dos pestañas no pueden publicar por encima de tres');
 await assertFails(setDoc(doc(db,'reports/quota-without-counter'),report('quota-parallel','quota-without-counter')));
 const other=env.authenticatedContext('quota-other');
 await assertFails(getDoc(doc(other.firestore(),'publishLimits/quota-parallel')));
 await assertFails(deleteDoc(doc(other.firestore(),'publishLimits/quota-parallel')));
 await assertFails(getDocs(collection(db,'publishLimits')));
 await assertFails(setDoc(doc(other.firestore(),'publishLimits/quota-other'),{count:1,windowStartedAt:serverTimestamp(),updatedAt:serverTimestamp(),lastReportId:'nonexistent-report'}));
 const fresh=env.authenticatedContext('quota-batch'),batch=writeBatch(fresh.firestore());
 batch.set(doc(fresh.firestore(),'publishLimits/quota-batch'),{count:1,windowStartedAt:serverTimestamp(),updatedAt:serverTimestamp(),lastReportId:'quota-batch-first'});
 batch.set(doc(fresh.firestore(),'reports/quota-batch-first'),report('quota-batch','quota-batch-first'));
 batch.set(doc(fresh.firestore(),'reports/quota-batch-second'),report('quota-batch','quota-batch-second'));
 await assertFails(batch.commit());
 console.log('PASS límite: Google/invitado, tres por hora, cuarta denegada, reinicio tras una hora, concurrencia, privacidad, sin borrado/reset, sin publicación directa ni doble publicación por contador');
}finally{await env.cleanup();}
