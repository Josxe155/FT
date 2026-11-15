import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {getDatabase} from 'firebase-admin/database';
import {getAuth} from 'firebase-admin/auth';
import {maintain,policy} from '../cleanup.mjs';
import {DAY} from '../policy.mjs';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw new Error('Only run against all three emulators');
const projectId='demo-funados-security',app=initializeApp({projectId,databaseURL:`https://${projectId}-default-rtdb.firebaseio.com`});
const db=getFirestore(app),rtdb=getDatabase(app),auth=getAuth(app),now=Date.now(),old=now-31*DAY;
const api={db,rtdb,auth,settings:policy,now};
try{
 await db.doc('maintenance/control').set({rolloutAt:Timestamp.fromMillis(old)});
 for(const [id,age,like] of [['expired',31,0],['supported',31,1],['fresh',2,0],['inconsistent',31,0]]){
  await db.doc('reports/'+id).set({id,authorUid:'idle',createdAt:Timestamp.fromMillis(now-age*DAY),status:'approved'});
  await db.doc('reports/'+id+'/reactionStats/summary').set({like,wow:0,concern:0});
 }
 await db.doc('reports/inconsistent/reactions/someone').set({kind:'like'});
 await db.doc('reports/expired/replies/comment/reactions/vote').set({kind:'like'});
 // El padre falta: hay un voto huérfano que también debe limpiarse.
 await db.doc('reports/commented').set({id:'commented',authorUid:'active',createdAt:Timestamp.fromMillis(old),status:'approved'});
 await db.doc('reports/commented/replies/comment').set({text:'Conversación que se conserva'});
 await db.doc('reports/wow').set({id:'wow',authorUid:'active',createdAt:Timestamp.fromMillis(old),status:'approved'});
 await db.doc('reports/wow/reactionStats/summary').set({like:0,wow:1,concern:0});
 await db.doc('flags/for-expired').set({reportId:'expired'});
 await rtdb.ref('evidence/idle/expired').set({files:{0:{meta:{name:'file'},chunks:{0:'YWJj'}}}});
 await rtdb.ref('evidence/idle/supported').set({keep:true});
 await rtdb.ref('evidenceVisibility/idle/expired').set({visible:true,ownerUid:'idle'});
 const imported=await auth.importUsers(['idle','active','protected','recent-login'].map(uid=>({uid,...(uid==='protected'?{email:policy.protectedEmails[0],emailVerified:true}:{}),metadata:{creationTime:new Date(old).toISOString(),lastSignInTime:new Date(uid==='recent-login'?now:old).toISOString()}})));
 assert.equal(imported.failureCount,0);
 await rtdb.ref('activity/active').set({lastActiveAt:now});
 await db.doc('profiles/idle').set({tiktokUsername:'test'});await db.doc('userPrefs/idle').set({alias:'test'});
 const preview=await maintain({...api,apply:false});assert.equal(preview.reportsEligible,1);assert.equal(preview.usersEligible,1);
 assert.equal((await db.doc('reports/expired').get()).exists,true);assert.equal((await auth.getUser('idle')).uid,'idle');
 const applied=await maintain({...api,apply:true});assert.equal(applied.errors,0);assert.equal(applied.reportsDeleted,1);assert.equal(applied.usersDeleted,1);
 assert.equal((await db.doc('reports/expired').get()).exists,false);
 assert.equal((await db.doc('reports/expired/replies/comment/reactions/vote').get()).exists,false);
 assert.equal((await db.doc('flags/for-expired').get()).exists,false);
 assert.equal((await rtdb.ref('evidence/idle/expired').get()).exists(),false);
 assert.equal((await rtdb.ref('evidenceVisibility/idle/expired').get()).exists(),false);
 for(const id of ['supported','fresh','inconsistent','commented','wow'])assert.equal((await db.doc('reports/'+id).get()).exists,true);
 assert.equal((await rtdb.ref('evidence/idle/supported').get()).exists(),true);
 await assert.rejects(auth.getUser('idle'),e=>e.code==='auth/user-not-found');
 for(const uid of ['active','protected','recent-login'])assert.equal((await auth.getUser(uid)).uid,uid);
 assert.equal((await db.doc('profiles/idle').get()).exists,false);assert.equal((await db.doc('userPrefs/idle').get()).exists,false);
 const again=await maintain({...api,apply:true});assert.equal(again.errors,0);assert.equal(again.reportsDeleted,0);assert.equal(again.usersDeleted,0);
 // Un fallo después de marcar el reporte debe poder retomarse aunque el documento padre desaparezca.
 await db.doc('maintenanceReportJobs/orphan').set({reportId:'orphan',authorUid:'idle',startedAt:Timestamp.fromMillis(now)});
 await db.doc('reports/orphan/replies/child').set({text:'orphan'});
 await rtdb.ref('evidence/idle/orphan').set({bytes:'test'});
 const resumed=await maintain({...api,apply:true});assert.equal(resumed.reportsDeleted,1);assert.equal((await db.doc('reports/orphan/replies/child').get()).exists,false);
 // Una ejecución inicial da margen a las cuentas existentes.
 await auth.importUsers([{uid:'legacy',metadata:{creationTime:new Date(old).toISOString(),lastSignInTime:new Date(old).toISOString()}}]);
 await db.doc('maintenance/control').delete();const initial=await maintain({...api,apply:true});assert.equal(initial.usersDeleted,0);assert.equal((await auth.getUser('legacy')).uid,'legacy');
 console.log('PASS mantenimiento: vista previa, cero reacciones/comentarios, frescura, autor protegido, actividad, acceso reciente, cascada, reintento y margen inicial');
}finally{await deleteApp(app);}
