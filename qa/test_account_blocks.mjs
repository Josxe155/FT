import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,collection,getDocs,serverTimestamp} from 'firebase/firestore';
import {ref,set,get,remove} from 'firebase/database';
const env=await initializeTestEnvironment({projectId:'demo-funados-security',firestore:{host:'127.0.0.1',port:8086,rules:readFileSync('firestore.rules','utf8')},database:{host:'127.0.0.1',port:9000,rules:readFileSync('database.rules.json','utf8')}});
const user=env.authenticatedContext('blocked-target'),reader=env.authenticatedContext('block-reader');
try{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'reports/block-check'),{authorUid:'blocked-target',status:'approved'});
  await setDoc(doc(c.firestore(),'userPrefs/blocked-target'),{uid:'blocked-target',alias:'Privado',updatedAt:serverTimestamp()});
  await set(ref(c.database(),'evidence/blocked-target/block-check'),{files:{0:{chunks:{0:'YWJj'}}}});
  await set(ref(c.database(),'evidenceVisibility/blocked-target/block-check'),{ownerUid:'blocked-target',visible:true});
 });
 await assertSucceeds(getDoc(doc(user.firestore(),'reports/block-check')));
 await assertSucceeds(get(ref(user.database(),'evidence/blocked-target/block-check')));
 for(const context of [user,reader]){
  await assertFails(setDoc(doc(context.firestore(),'accountBlocks/blocked-target'),{blockedAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(context.firestore(),'accountBlocks/blocked-target')));
  await assertFails(set(ref(context.database(),'blockedUsers/blocked-target'),true));
  await assertFails(remove(ref(context.database(),'blockedUsers/blocked-target')));
 }
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'accountBlocks/blocked-target'),{blockedAt:serverTimestamp()});
  await set(ref(c.database(),'blockedUsers/blocked-target'),true);
 });
 await assertSucceeds(getDoc(doc(user.firestore(),'accountBlocks/blocked-target')));
 await assertSucceeds(get(ref(user.database(),'blockedUsers/blocked-target')));
 await assertFails(getDoc(doc(reader.firestore(),'accountBlocks/blocked-target')));
 await assertFails(get(ref(reader.database(),'blockedUsers/blocked-target')));
 await assertFails(getDocs(collection(reader.firestore(),'accountBlocks')));
 await assertFails(getDoc(doc(user.firestore(),'reports/block-check')));
 await assertFails(getDoc(doc(user.firestore(),'userPrefs/blocked-target')));
 await assertFails(setDoc(doc(user.firestore(),'userPrefs/blocked-target'),{uid:'blocked-target',alias:'Cambio',updatedAt:serverTimestamp()}));
 await assertFails(get(ref(user.database(),'evidence/blocked-target/block-check')));
 await assertFails(set(ref(user.database(),'presence/blocked-target'),{online:true,lastSeen:Date.now()}));
 await assertFails(remove(ref(user.database(),'evidence/blocked-target/block-check')));
 await assertSucceeds(getDoc(doc(reader.firestore(),'reports/block-check')));
 await assertSucceeds(get(ref(reader.database(),'evidence/blocked-target/block-check')));
 // Se mantiene la denegación con un token anterior al borrado de Auth: los marcadores permanecen.
 await assertFails(getDoc(doc(user.firestore(),'profiles/blocked-target')));
 await env.withSecurityRulesDisabled(async c=>{
  await deleteDoc(doc(c.firestore(),'accountBlocks/blocked-target'));
  await remove(ref(c.database(),'blockedUsers/blocked-target'));
 });
 await assertSucceeds(getDoc(doc(user.firestore(),'reports/block-check')));
 await assertSucceeds(get(ref(user.database(),'evidence/blocked-target/block-check')));
 console.log('PASS bloqueos: permisos inmediatos con token existente, marcador propio privado, sin auto desbloqueo, otras cuentas conservan lectura y desbloqueo restaura acceso');
}finally{await env.cleanup();}
