import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore,Timestamp,FieldPath} from 'firebase-admin/firestore';
import {getDatabase} from 'firebase-admin/database';
import {getAuth} from 'firebase-admin/auth';
import {DAY,shouldDeleteReport,shouldDeleteUser} from './policy.mjs';
export const policy=JSON.parse(readFileSync(new URL('./policy.json',import.meta.url),'utf8'));

export async function maintain({db,rtdb,auth,apply=false,now=Date.now(),settings=policy}) {
 const control=db.doc('maintenance/control'),owner=randomUUID();
 let state=(await control.get()).data()||{};
 const rollout=state.rolloutAt?.toMillis?.()??now;
 const result={mode:apply?'apply':'dry-run',initialized:Boolean(state.rolloutAt),reportsDeleted:0,reportsEligible:0,usersDeleted:0,usersEligible:0,errors:0,reportsScanned:0,usersScanned:0};
 if(apply){
  await db.runTransaction(async tx=>{
   const latest=(await tx.get(control)).data()||{};
   if(latest.leaseUntil?.toMillis()>now)throw new Error('Another maintenance run holds the lease');
   tx.set(control,{rolloutAt:latest.rolloutAt||Timestamp.fromMillis(now),leaseOwner:owner,leaseUntil:Timestamp.fromMillis(now+30*60*1000)},{merge:true});
   state=latest;
  });
 }
 const rolloutAt=state.rolloutAt?.toMillis?.()??rollout;
 async function purgeReport(job){
  const {reportId,authorUid}=job.data();
  if(!reportId||!authorUid||reportId!==job.id)throw new Error('Invalid report cleanup job');
  // Bloquear antes de borrar. Los trabajos separados permiten retomar fallos parciales.
  await rtdb.ref('blockedEvidence/'+reportId).set(true);
  await rtdb.ref().update({[`evidence/${authorUid}/${reportId}`]:null,[`evidenceUpdates/${authorUid}/${reportId}`]:null,[`evidenceVisibility/${authorUid}/${reportId}`]:null,[`evidenceVisibility/${reportId}`]:null});
  for(;;){
   const flags=await db.collection('flags').where('reportId','==',reportId).limit(200).get();
   if(flags.empty)break;
   const batch=db.batch();flags.docs.forEach(d=>batch.delete(d.ref));await batch.commit();
  }
  const writer=db.bulkWriter({throttling:{initialOpsPerSecond:20,maxOpsPerSecond:50}});
  try{await db.recursiveDelete(db.doc('reports/'+reportId),writer);}finally{await writer.close();}
  await rtdb.ref('blockedEvidence/'+reportId).remove();
  await job.ref.delete();result.reportsDeleted++;
 }
 async function considerReport(snap){
  const ref=snap.ref;
  if(!apply){
   const [counts,votes,comments]=await Promise.all([ref.collection('reactionStats').doc('summary').get(),ref.collection('reactions').where('kind','in',['like','wow','concern']).limit(1).get(),ref.collection('replies').limit(1).get()]);
   if(shouldDeleteReport(snap.data(),counts.exists?counts.data():{like:0,wow:0,concern:0},now,settings,!comments.empty)&&votes.empty)result.reportsEligible++;
   return;
  }
  const jobRef=db.doc('maintenanceReportJobs/'+snap.id);
  const selected=await db.runTransaction(async tx=>{
   const [fresh,counts,votes,comments]=await Promise.all([tx.get(ref),tx.get(ref.collection('reactionStats').doc('summary')),tx.get(ref.collection('reactions').where('kind','in',['like','wow','concern']).limit(1)),tx.get(ref.collection('replies').limit(1))]);
   if(!fresh.exists||!shouldDeleteReport(fresh.data(),counts.exists?counts.data():{like:0,wow:0,concern:0},now,settings,!comments.empty)||!votes.empty)return false;
   const authorUid=fresh.get('authorUid');if(typeof authorUid!=='string'||!authorUid)return false;
   tx.set(jobRef,{reportId:snap.id,authorUid,startedAt:Timestamp.fromMillis(now)});
   tx.update(ref,{status:'deleting'});return true;
  });
  if(selected){result.reportsEligible++;await purgeReport(await jobRef.get());}
 }
 async function userEligible(user){
  return shouldDeleteUser(user,(await rtdb.ref('activity/'+user.uid).get()).val(),rolloutAt,now,settings);
 }
 async function purgeUser(job){
  const uid=job.id;
  try{
   const fresh=await auth.getUser(uid);
   // Revisar otra vez: alguien pudo volver a iniciar sesión después del listado.
   if(!await userEligible(fresh)){await job.ref.delete();return;}
   await auth.deleteUser(uid);
  }catch(e){if(e.code!=='auth/user-not-found')throw e;}
  // Se conservan publicaciones con apoyo y sus evidencias, comentarios y votos.
  for(const collection of ['profiles','userPrefs'])await db.recursiveDelete(db.doc(collection+'/'+uid));
  await rtdb.ref().update({['activity/'+uid]:null,['presence/'+uid]:null,['visits/'+uid]:null});
  await job.ref.delete();result.usersDeleted++;
 }
 try{
  if(apply){
   const jobs=await db.collection('maintenanceReportJobs').limit(settings.maxReportsPerRun).get();
   for(const job of jobs.docs){try{await purgeReport(job);}catch{result.errors++;}}
  }
  let cursor=state.reportCursor||null,reportBudget=settings.maxReportsPerRun;
  while(result.reportsScanned<1000 && result.reportsEligible<reportBudget && result.reportsDeleted<reportBudget){
   let q=db.collection('reports').where('createdAt','<=',Timestamp.fromMillis(now-settings.reportRetentionDays*DAY)).orderBy('createdAt').orderBy(FieldPath.documentId()).limit(100);
   if(cursor)q=q.startAfter(cursor.createdAt,cursor.id);
   const page=await q.get();if(page.empty){cursor=null;break;}
   for(const snap of page.docs){
    result.reportsScanned++;
    try{await considerReport(snap);}catch{result.errors++;}
    cursor={createdAt:snap.get('createdAt'),id:snap.id};
    if(result.reportsEligible>=reportBudget||result.reportsDeleted>=reportBudget)break;
   }
   if(page.size<100){cursor=null;break;}
  }
  if(apply){
   await control.set({reportCursor:cursor},{merge:true});
   const jobs=await db.collection('maintenanceUserJobs').limit(settings.maxUsersPerRun).get();
   for(const job of jobs.docs){try{await purgeUser(job);}catch{result.errors++;}}
  }
  let token=state.authCursor||undefined;
  for(let pageNo=0;pageNo<settings.maxAuthPagesPerRun && result.usersEligible<settings.maxUsersPerRun && result.usersDeleted<settings.maxUsersPerRun;pageNo++){
   const page=await auth.listUsers(1000,token);let finished=true;
   for(const user of page.users){
    result.usersScanned++;
    try{
     if(await userEligible(user)){
      result.usersEligible++;
      if(apply){const ref=db.doc('maintenanceUserJobs/'+user.uid);await ref.set({startedAt:Timestamp.fromMillis(now)});await purgeUser(await ref.get());}
     }
    }catch{result.errors++;}
    if(result.usersEligible>=settings.maxUsersPerRun||result.usersDeleted>=settings.maxUsersPerRun){finished=false;break;}
   }
   if(!finished)break;
   token=page.pageToken;
   if(!token)break;
  }
  if(apply)await control.set({authCursor:token||null,lastCompletedAt:Timestamp.fromMillis(Date.now()),lastResult:result},{merge:true});
  return result;
 }finally{
  if(apply)await db.runTransaction(async tx=>{const s=await tx.get(control);if(s.get('leaseOwner')===owner)tx.update(control,{leaseOwner:null,leaseUntil:Timestamp.fromMillis(0)});});
 }
}

async function main(){
 const projectId=process.env.GCLOUD_PROJECT||policy.projectId;
 if(projectId!==policy.projectId&&!projectId.startsWith('demo-'))throw new Error('Unexpected target project');
 const emulatorFlags=['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST'].map(k=>Boolean(process.env[k]));
 if(projectId.startsWith('demo-')&&!emulatorFlags.every(Boolean))throw new Error('Demo project requires all three emulators');
 if(projectId===policy.projectId&&emulatorFlags.some(Boolean))throw new Error('Do not mix production and emulator targets');
 const apply=process.argv.includes('--apply');
 if(apply&&!projectId.startsWith('demo-')&&process.env.RETENTION_APPLY_AUTHORIZED!=='true')throw new Error('Production deletion requires explicit activation');
 const app=initializeApp({projectId,databaseURL:projectId.startsWith('demo-')?`https://${projectId}-default-rtdb.firebaseio.com`:policy.databaseURL,...(projectId.startsWith('demo-')?{}:{credential:applicationDefault()})});
 const result=await maintain({db:getFirestore(app),rtdb:getDatabase(app),auth:getAuth(app),apply});
 console.log(JSON.stringify(result));if(result.errors)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('Maintenance failed:',e.code||e.message);process.exitCode=1;});
