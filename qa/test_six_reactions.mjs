import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,collection,getDocs,runTransaction,writeBatch,serverTimestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-funados-security',firestore:{host:'127.0.0.1',port:8086,rules:readFileSync('firestore.rules','utf8')}});
const alice=env.authenticatedContext('reaction-alice'),bob=env.authenticatedContext('reaction-bob');
const kinds=['like','wow','concern','angry','sad','love'];
const zero=()=>Object.fromEntries(kinds.map(kind=>[kind,0]));
const root='reports/six-reactions';
const path=comment=>root+(comment?'/replies/comment':'');
async function vote(context,kind,comment=false){
 const db=context.firestore(),base=path(comment),v=doc(db,base+'/reactions/reaction-alice'),s=doc(db,base+'/reactionStats/summary');
 return runTransaction(db,async tx=>{const [old,summary]=await Promise.all([tx.get(v),tx.get(s)]),counts={...zero(),...(summary.data()||{})},previous=old.data()?.kind||'none';if(previous!=='none')counts[previous]--;if(kind!=='none')counts[kind]++;delete counts.updatedAt;tx.set(v,{kind,updatedAt:serverTimestamp()});tx.set(s,{...counts,updatedAt:serverTimestamp()});});
}
try{
 const initial=writeBatch(alice.firestore());initial.set(doc(alice.firestore(),'publishLimits/reaction-alice'),{count:1,windowStartedAt:serverTimestamp(),updatedAt:serverTimestamp(),lastReportId:'six-reactions'});
 initial.set(doc(alice.firestore(),root),{id:'six-reactions',canton:'machala',title:'Prueba de seis reacciones',description:'Publicación ficticia para verificar los contadores y sus permisos.',category:'Funa',status:'approved',authorUid:'reaction-alice',authorAlias:'Anónimo',createdAt:serverTimestamp(),images:[],media:[]});await assertSucceeds(initial.commit());
 await assertSucceeds(setDoc(doc(alice.firestore(),root+'/replies/comment'),{reportId:'six-reactions',text:'Comentario para probar las seis reacciones.',authorUid:'reaction-alice',authorAlias:'Anónimo',status:'approved',createdAt:serverTimestamp()}));
 // Un resumen legado de tres claves migra al cambiar de reacción.
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),root+'/reactionStats/summary'),{like:1,wow:0,concern:0,updatedAt:serverTimestamp()});await setDoc(doc(context.firestore(),root+'/reactions/reaction-alice'),{kind:'like',updatedAt:serverTimestamp()});});
 for(const comment of [false,true]){
  for(const kind of ['angry','sad','love','like','wow','concern']){
   await assertSucceeds(vote(alice,kind,comment));
   const counts=(await getDoc(doc(alice.firestore(),path(comment)+'/reactionStats/summary'))).data();
   for(const key of kinds)assert.equal(counts[key],key===kind?1:0);
  }
  await assertSucceeds(vote(alice,'none',comment));
  const counts=(await getDoc(doc(alice.firestore(),path(comment)+'/reactionStats/summary'))).data();for(const key of kinds)assert.equal(counts[key],0);
  // No se puede inflar un total ni escribir un voto de otra cuenta.
  await assertFails(setDoc(doc(alice.firestore(),path(comment)+'/reactionStats/summary'),{...zero(),angry:50,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(alice.firestore(),path(comment)+'/reactions/reaction-bob'),{kind:'love',updatedAt:serverTimestamp()}));
  const tampered=writeBatch(alice.firestore());tampered.set(doc(alice.firestore(),path(comment)+'/reactions/reaction-alice'),{kind:'sad',updatedAt:serverTimestamp()});tampered.set(doc(alice.firestore(),path(comment)+'/reactionStats/summary'),{...zero(),sad:9,updatedAt:serverTimestamp()});await assertFails(tampered.commit());
 }
 await assertFails(getDoc(doc(bob.firestore(),root+'/reactions/reaction-alice')));
 await assertFails(getDocs(collection(bob.firestore(),root+'/reactions')));
 await assertFails(setDoc(doc(alice.firestore(),root+'/reactions/reaction-alice'),{kind:'unsupported',updatedAt:serverTimestamp()}));
 // Dos cuentas conservan sus votos y los campos nuevos nunca pueden borrarse para resetearlos.
 const batch=writeBatch(bob.firestore());batch.set(doc(bob.firestore(),root+'/reactions/reaction-bob'),{kind:'love',updatedAt:serverTimestamp()});batch.set(doc(bob.firestore(),root+'/reactionStats/summary'),{...zero(),love:1,updatedAt:serverTimestamp()});await assertSucceeds(batch.commit());
 await assertSucceeds(vote(alice,'angry'));const both=(await getDoc(doc(alice.firestore(),root+'/reactionStats/summary'))).data();assert.equal(both.love,1);assert.equal(both.angry,1);
 const reset=writeBatch(alice.firestore());reset.set(doc(alice.firestore(),root+'/reactions/reaction-alice'),{kind:'like',updatedAt:serverTimestamp()});reset.set(doc(alice.firestore(),root+'/reactionStats/summary'),{like:1,wow:0,concern:0,updatedAt:serverTimestamp()});await assertFails(reset.commit());
 console.log('PASS seis reacciones: publicaciones/comentarios, cambiar/quitar, legado, dos cuentas, privacidad, antiinflado y antirreinicio');
}finally{await env.cleanup();}
