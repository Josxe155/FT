import {DAY,timestampMillis,eligiblePost,eligibleUser} from './retention-policy.js';
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const valueOf=v=>v?.timestampValue??v?.stringValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.doubleValue!==undefined?Number(v.doubleValue):v?.booleanValue!==undefined?v.booleanValue:null);
const fieldsOf=doc=>Object.fromEntries(Object.entries(doc?.fields||{}).map(([k,v])=>[k,valueOf(v)]));
const encode=v=>v===null?{nullValue:null}:v instanceof Date?{timestampValue:v.toISOString()}:typeof v==='number'?{integerValue:String(Math.floor(v))}:typeof v==='boolean'?{booleanValue:v}:{stringValue:String(v)};
export function createMaintenance({cfg,auth,rtdb,mod,admin,onChange,onFinished=()=>{}}){
 const base=`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`,identity=`https://identitytoolkit.googleapis.com/v1/projects/${cfg.projectId}`;
 const state={connected:false,busy:false,message:'',posts:[],users:[],postSelection:new Set(),userSelection:new Set(),postCursor:null,userCursor:null,morePosts:false,moreUsers:false,scannedPosts:0,scannedUsers:0,rolloutAt:null,reportJobs:[],userJobs:[],now:Date.now()};
 let accessToken='',expires=0,connectedUid='',leaseOwner=crypto.randomUUID(),cleanupAbort='';
 const changed=()=>onChange();
 const validAdmin=()=>auth.currentUser?.emailVerified&&auth.currentUser.email?.toLowerCase()===admin;
 function disconnect(){accessToken='';connectedUid='';expires=0;state.connected=false;state.posts=[];state.users=[];state.postSelection.clear();state.userSelection.clear();}
 async function request(url,body,method=body?'POST':'GET',optional=false){
  if(cleanupAbort)throw new Error(cleanupAbort);
  if(!validAdmin()||auth.currentUser.uid!==connectedUid||!accessToken||Date.now()>expires){disconnect();throw new Error('Vuelve a autorizar la revisión con Google.');}
  const response=await fetch(url,{method,signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(optional&&response.status===404)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401)disconnect();const error=new Error(response.status===403?'Google rechazó el permiso. Usa la cuenta propietaria del proyecto y autoriza los permisos de mantenimiento.':data.error?.message||`Error ${response.status}`);error.status=response.status;throw error;}
  return data;
 }
 const documentURL=path=>base+'/'+path.split('/').map(encodeURIComponent).join('/');
 const read=(path,transaction)=>request(documentURL(path)+(transaction?'?transaction='+encodeURIComponent(transaction):''),null,'GET',true);
 const write=(path,values)=>({update:{name:base.split('https://firestore.googleapis.com/v1/')[1]+'/'+path,fields:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,encode(v)]))},updateMask:{fieldPaths:Object.keys(values)}});
 async function commit(writes,transaction){return request(base+':commit',{writes,...(transaction?{transaction}:{})});}
 async function transaction(fn){
  for(let attempt=0;attempt<3;attempt++){
   const {transaction:token}=await request(base+':beginTransaction',{options:{readWrite:{}}});
   try{const writes=await fn(token);if(!writes.length){await request(base+':rollback',{transaction:token});return;}return await commit(writes,token);}
   catch(error){await request(base+':rollback',{transaction:token}).catch(()=>{});if(error.status!==409||attempt===2)throw error;}
  }
 }
 async function query(parent,structuredQuery,token){const list=await request((parent?documentURL(parent):base)+':runQuery',{structuredQuery,...(token?{transaction:token}:{})});return list.filter(x=>x.document).map(x=>x.document);}
 async function page(collection,pageToken){return request(documentURL(collection)+'?pageSize=200&showMissing=true'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));}
 async function removeDoc(path){await request(documentURL(path),null,'DELETE',true);}
 async function removeTree(path){
  let token;
  do{
   const collections=await request(documentURL(path)+':listCollectionIds',{pageSize:100,...(token?{pageToken:token}:{})});
   for(const id of collections.collectionIds||[]){let next;do{const list=await page(path+'/'+id,next);for(const doc of list.documents||[])await removeTree(doc.name.split('/documents/')[1]);next=list.nextPageToken;}while(next);}
   token=collections.nextPageToken;
  }while(token);
  await removeDoc(path);
 }
 async function removeRealtime(paths){await request(cfg.databaseURL.replace(/\/$/,'')+'/.json',Object.fromEntries(paths.map(p=>[p,null])),'PATCH');}
 async function realtimeSet(path,value){await request(cfg.databaseURL.replace(/\/$/,'')+'/'+path+'.json',value,'PUT');}
 async function serverNow(){const snap=await mod.rtdb.get(mod.rtdb.ref(rtdb,'.info/serverTimeOffset'));state.now=Date.now()+Number(snap.val()||0);return state.now;}
 async function control(){
  let doc=await read('maintenance/control');
  if(!doc){try{await commit([{update:{name:base.split('https://firestore.googleapis.com/v1/')[1]+'/maintenance/control',fields:{}},currentDocument:{exists:false},updateTransforms:[{fieldPath:'rolloutAt',setToServerValue:'REQUEST_TIME'}]}]);}catch(error){if(![409,412].includes(error.status))throw error;}doc=await read('maintenance/control');}
  state.rolloutAt=fieldsOf(doc).rolloutAt;return doc;
 }
 async function pool(items,fn){let position=0;await Promise.all(Array.from({length:Math.min(5,items.length)},async()=>{for(;;){const index=position++;if(index>=items.length)break;await fn(items[index]);}}));}
 const activeVoteQuery={from:[{collectionId:'reactions'}],where:{fieldFilter:{field:{fieldPath:'kind'},op:'IN',value:{arrayValue:{values:['like','wow','concern','angry','sad','love'].map(stringValue=>({stringValue}))}}}},limit:1};
 const commentQuery={from:[{collectionId:'replies'}],limit:1};
 async function reportInfo(doc,token){
  const data=fieldsOf(doc),id=doc.name.split('/').pop();
  const [stats,votes,comments]=await Promise.all([read('reports/'+id+'/reactionStats/summary',token),query('reports/'+id,activeVoteQuery,token),query('reports/'+id,commentQuery,token)]);
  const totals=stats?fieldsOf(stats):{like:0,wow:0,concern:0};
  return {...data,id,eligible:eligiblePost(data,totals,state.now,comments.length>0)&&votes.length===0,counts:totals};
 }
 function userInfo(user){let claims={};try{claims=JSON.parse(user.customAttributes||'{}');}catch{}return {uid:user.localId,email:user.email||'',name:user.displayName||user.email||'Invitado',createdAt:user.createdAt,lastLoginAt:user.lastLoginAt,customClaims:claims};}
 async function lookupUser(uid){const data=await request(identity+'/accounts:lookup',{localId:[uid]});return data.users?.[0]?userInfo(data.users[0]):null;}
 async function refresh({more=false}={}){
  if(state.busy)return;state.busy=true;state.message='Revisando datos y actividad…';changed();
  try{
   await serverNow();await control();
   if(!more){state.posts=[];state.users=[];state.scannedPosts=0;state.scannedUsers=0;state.postCursor=null;state.userCursor=null;state.morePosts=true;state.moreUsers=true;state.postSelection.clear();state.userSelection.clear();}
   const activity=(await mod.rtdb.get(mod.rtdb.ref(rtdb,'activity'))).val()||{};
   if(state.morePosts){
    const structured={from:[{collectionId:'reports'}],where:{fieldFilter:{field:{fieldPath:'createdAt'},op:'LESS_THAN_OR_EQUAL',value:{timestampValue:new Date(state.now-30*DAY).toISOString()}}},orderBy:[{field:{fieldPath:'createdAt'},direction:'ASCENDING'},{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:100};
    if(state.postCursor)structured.startAt={values:state.postCursor,before:false};
    const docs=await query('',structured);state.scannedPosts+=docs.length;
    const found=[];await pool(docs,async doc=>{const info=await reportInfo(doc);if(info.eligible&&safeId(info.id)&&safeId(info.authorUid))found.push(info);});
    state.posts=[...new Map([...state.posts,...found].map(r=>[r.id,r])).values()];state.morePosts=docs.length===100;
    if(docs.length){const last=docs[docs.length-1];state.postCursor=[last.fields.createdAt,{referenceValue:last.name}];}
   }
   if(state.moreUsers){
    const data=await request(identity+'/accounts:batchGet?maxResults=1000'+(state.userCursor?'&nextPageToken='+encodeURIComponent(state.userCursor):''));
    state.scannedUsers+=(data.users||[]).length;
    for(const raw of data.users||[]){const user=userInfo(raw);if(safeId(user.uid)&&eligibleUser(user,activity[user.uid],0,state.now,[admin]))state.users.push({...user,eligible:eligibleUser(user,activity[user.uid],state.rolloutAt,state.now,[admin]),lastActiveAt:Math.max(timestampMillis(user.createdAt)||0,timestampMillis(user.lastLoginAt)||0,timestampMillis(activity[user.uid]?.lastActiveAt)||0)});}
    state.users=[...new Map(state.users.map(u=>[u.uid,u])).values()];state.userCursor=data.nextPageToken||null;state.moreUsers=!!state.userCursor;
   }
   const [reports,users]=await Promise.all([page('maintenanceReportJobs'),page('maintenanceUserJobs')]);
   state.reportJobs=reports.documents||[];state.userJobs=users.documents||[];
   state.message=`Revisadas ${state.scannedPosts} publicaciones antiguas y ${state.scannedUsers} cuentas. ${state.morePosts||state.moreUsers?'Quedan páginas por revisar.':'Revisión completa.'}`;
  }catch(error){state.message=error.message;}finally{state.busy=false;changed();}
 }
 async function connect(review=true){
  if(!validAdmin()||state.busy)return false;state.busy=true;state.message='Autoriza el acceso temporal de tu cuenta administradora…';changed();
  try{
   const provider=new mod.auth.GoogleAuthProvider();
   for(const scope of ['https://www.googleapis.com/auth/datastore','https://www.googleapis.com/auth/firebase','https://www.googleapis.com/auth/firebase.database','https://www.googleapis.com/auth/userinfo.email'])provider.addScope(scope);
   const result=await mod.auth.reauthenticateWithPopup(auth.currentUser,provider),credential=mod.auth.GoogleAuthProvider.credentialFromResult(result);
   if(!validAdmin()||!credential?.accessToken)throw new Error('No se obtuvo autorización de la cuenta administradora.');
   accessToken=credential.accessToken;expires=Date.now()+50*60*1000;connectedUid=result.user.uid;state.connected=true;
  }catch(error){state.message=error.code==='auth/popup-closed-by-user'?'Autorización cancelada. No se modificaron datos.':error.message;}
  finally{state.busy=false;changed();}
  if(state.connected&&review)await refresh();
  return state.connected;
 }
 async function acquire(){await serverNow();await transaction(async token=>{const current=fieldsOf(await read('maintenance/control',token));if(timestampMillis(current.leaseUntil)>state.now&&current.leaseOwner!==leaseOwner)throw new Error('Hay otra limpieza en curso. Espera a que termine.');return [write('maintenance/control',{leaseOwner,leaseUntil:new Date(state.now+30*60*1000)})];});}
 async function release(){await transaction(async token=>{const current=fieldsOf(await read('maintenance/control',token));return current.leaseOwner===leaseOwner?[write('maintenance/control',{leaseOwner:null,leaseUntil:new Date(0)})]:[];});}
 async function queueReport(id){
  let queued=false;
  await transaction(async token=>{
   queued=false;const doc=await read('reports/'+id,token);if(!doc)return [];
   const info=await reportInfo(doc,token);if(!info.eligible||!safeId(info.authorUid))return [];
   queued=true;return [write('maintenanceReportJobs/'+id,{reportId:id,authorUid:info.authorUid,startedAt:new Date(state.now)}),write('reports/'+id,{status:'deleting'})];
  });return queued;
 }
 async function purgeReport(id){
  const job=fieldsOf(await read('maintenanceReportJobs/'+id));if(!job.reportId)return false;
  if(job.reportId!==id||!safeId(id)||!safeId(job.authorUid))throw new Error('Trabajo de publicación no válido.');
  await realtimeSet('blockedEvidence/'+id,true);
  await removeRealtime([`evidence/${job.authorUid}/${id}`,`evidenceUpdates/${job.authorUid}/${id}`,`evidenceVisibility/${job.authorUid}/${id}`,`evidenceVisibility/${id}`]);
  for(;;){const flags=await query('',{from:[{collectionId:'flags'}],where:{fieldFilter:{field:{fieldPath:'reportId'},op:'EQUAL',value:{stringValue:id}}},limit:100});if(!flags.length)break;await pool(flags,d=>removeDoc(d.name.split('/documents/')[1]));}
  await removeTree('reports/'+id);await removeRealtime(['blockedEvidence/'+id]);await removeDoc('maintenanceReportJobs/'+id);return true;
 }
 async function canDeleteUser(user){const activity=(await mod.rtdb.get(mod.rtdb.ref(rtdb,'activity/'+user.uid))).val();return user.uid!==auth.currentUser.uid&&eligibleUser(user,activity,state.rolloutAt,state.now,[admin]);}
 async function purgeUser(uid){
  if(!safeId(uid)||uid===auth.currentUser.uid)throw new Error('Esta cuenta está protegida.');
  const fresh=await lookupUser(uid);
  if(fresh){if(!await canDeleteUser(fresh)){await removeDoc('maintenanceUserJobs/'+uid);return false;}await request(identity+'/accounts:delete',{localId:uid});}
  await removeTree('profiles/'+uid);await removeTree('userPrefs/'+uid);await removeTree('publishLimits/'+uid);await removeRealtime(['activity/'+uid,'presence/'+uid,'visits/'+uid]);await removeDoc('maintenanceUserJobs/'+uid);return true;
 }
 async function run(){
  if(state.busy||!state.connected)return;
  const posts=[...state.postSelection],users=[...state.userSelection];
  if(!posts.length&&!users.length&&!state.reportJobs.length&&!state.userJobs.length)return;
  if(!confirm(`Vas a eliminar ${posts.length} publicaciones y ${users.length} cuentas seleccionadas, y reanudar ${state.reportJobs.length+state.userJobs.length} trabajos pendientes. Se borrarán evidencias y comentarios de las publicaciones. Las cuentas eliminadas tendrán que entrar de nuevo. Esta acción no se puede deshacer. ¿Continuar?`))return;
  state.busy=true;state.message='Preparando limpieza… No cierres esta página.';changed();
  let acquired=false,renewTimer,renewing=false,cleanupRunning=true,donePosts=0,doneUsers=0,errors=0,skipped=0,lastError='';
  const before=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',before);
  try{
   await acquire();acquired=true;
   renewTimer=setInterval(async()=>{if(!cleanupRunning||renewing||cleanupAbort)return;renewing=true;try{await serverNow();if(!cleanupRunning)return;await transaction(async token=>{if(!cleanupRunning)return [];const current=fieldsOf(await read('maintenance/control',token));if(current.leaseOwner!==leaseOwner)throw new Error('El bloqueo de limpieza cambió.');return [write('maintenance/control',{leaseUntil:new Date(state.now+30*60*1000)})];});}catch{if(cleanupRunning)cleanupAbort='No se pudo renovar el bloqueo de limpieza. Vuelve a autorizar y reanuda los trabajos pendientes.';}finally{renewing=false;}},60000);
   const reportIds=[...new Set([...state.reportJobs.map(d=>d.name.split('/').pop()),...posts])];
   for(const id of reportIds){try{if(!await read('maintenanceReportJobs/'+id)&&!await queueReport(id)){skipped++;continue;}if(await purgeReport(id))donePosts++;else skipped++;}catch(error){errors++;lastError=error.message;if(error.status===401||error.status===403||!state.connected){error.counted=true;throw error;}}state.message=`Limpieza: ${donePosts} publicaciones y ${doneUsers} cuentas eliminadas. Errores: ${errors}. No cierres esta página.`;changed();}
   const userIds=[...new Set([...state.userJobs.map(d=>d.name.split('/').pop()),...users])];
   for(const uid of userIds){try{const job=await read('maintenanceUserJobs/'+uid);if(!job){const user=await lookupUser(uid);if(!user||!await canDeleteUser(user)){skipped++;continue;}await commit([write('maintenanceUserJobs/'+uid,{startedAt:new Date(state.now)})]);}if(await purgeUser(uid))doneUsers++;else skipped++;}catch(error){errors++;lastError=error.message;if(error.status===401||error.status===403||!state.connected){error.counted=true;throw error;}}state.message=`Limpieza: ${donePosts} publicaciones y ${doneUsers} cuentas eliminadas. Errores: ${errors}. No cierres esta página.`;changed();}
  }catch(error){if(!error.counted)errors++;lastError=error.message;state.message=error.message;}
  finally{cleanupRunning=false;clearInterval(renewTimer);cleanupAbort='';if(acquired)await release().catch(()=>{errors++;});window.removeEventListener('beforeunload',before);state.busy=false;state.postSelection.clear();state.userSelection.clear();}
  const summary=`Finalizado: ${donePosts} publicaciones y ${doneUsers} cuentas eliminadas. ${skipped} conservadas al revisar otra vez. ${errors} errores${errors?'; los trabajos incompletos se pueden reanudar':''}.${lastError?' '+lastError:''}`;
  await refresh();state.message=summary;changed();await onFinished();
 }
 // Directorio privado: Auth aporta el nombre de Google y userPrefs el apodo.
 // Se consulta solo bajo la autorización administrativa temporal ya existente.
 async function directoryPage(nextPageToken=''){
  if(state.busy)throw new Error('Espera a que termine la operación administrativa.');
  const result=await request(identity+'/accounts:batchGet?maxResults=50'+(nextPageToken?'&nextPageToken='+encodeURIComponent(nextPageToken):''));
  const users=result.users||[],ids=users.map(user=>user.localId).filter(safeId);
  const aliases=new Map();
  if(ids.length){
   const docs=await request(base+':batchGet',{documents:ids.map(uid=>`projects/${cfg.projectId}/databases/(default)/documents/userPrefs/${uid}`)});
   for(const item of docs){if(item.found){const doc=item.found,uid=doc.name.split('/').pop();aliases.set(uid,String(fieldsOf(doc).alias||'').trim());}}
  }
  return {users:users.map(user=>{
   const google=(user.providerUserInfo||[]).find(provider=>provider.providerId==='google.com');
   const guest=!google&&!user.email&&!(user.providerUserInfo||[]).length;
   return {uid:user.localId,name:google?(user.displayName||google.displayName||'Cuenta de Google sin nombre'):guest?(aliases.get(user.localId)||user.displayName||'Invitado sin apodo'):(user.displayName||'Cuenta sin nombre'),provider:google?'Google':guest?'Invitado':'Otra cuenta',createdAt:Number(user.createdAt)||0};
  }),nextPageToken:result.nextPageToken||''};
 }
 const day=v=>{const n=timestampMillis(v);return n===null?'—':new Date(n).toLocaleString('es-EC');};
 function view(){
  const disabled=state.busy?'disabled':'';
  if(!state.connected)return `<section class="maintenance-intro"><span class="dash-kicker">ESPACIO Y ACTIVIDAD</span><h2>Limpieza manual, con revisión previa</h2><p>Consulta publicaciones de más de 30 días sin reacciones ni comentarios, y cuentas inactivas. Elige qué borrar antes de confirmar.</p><ul><li>La cuenta administradora siempre está protegida.</li><li>La autorización de Google dura esta sesión del panel; no guardamos el token.</li><li>No se cambia el plan ni se crea una cuenta de servicio.</li></ul><button class="dash-btn primary" data-maint="connect" ${disabled}>${state.busy?'Autorizando…':'Autorizar revisión con Google'}</button><p class="dash-status" role="status">${escapeHTML(state.message)}</p></section>`;
  const jobs=state.reportJobs.length+state.userJobs.length,selected=state.postSelection.size+state.userSelection.size;
  return `<section class="maintenance-review"><div class="maintenance-toolbar"><div><span class="dash-kicker">REVISIÓN DE RETENCIÓN</span><h2>Recupera espacio con control</h2></div><button class="dash-btn" data-maint="refresh" ${disabled}>Actualizar revisión</button><button class="dash-btn" data-maint="connect" ${disabled}>Renovar autorización</button>${state.morePosts||state.moreUsers?`<button class="dash-btn" data-maint="more" ${disabled}>Revisar siguientes páginas</button>`:''}<button class="dash-btn danger-outline" data-maint="run" ${disabled||(!selected&&!jobs?'disabled':'')}>${jobs&&!selected?'Reanudar pendientes':'Eliminar selección'} (${selected||jobs})</button></div><p class="dash-status" role="status">${escapeHTML(state.message)}</p><p class="retention-grace">Las cuentas existentes tienen margen hasta ${day((timestampMillis(state.rolloutAt)||state.now)+30*DAY)}. Las publicaciones con cualquier reacción o comentario se conservan. Máximo 100 de cada tipo por selección.</p>${jobs?`<p class="retention-pending">${jobs} trabajos de borrado quedaron pendientes y pueden reanudarse.</p>`:''}<div class="maintenance-grid"><section><div class="maintenance-section-title"><h3>Publicaciones sin participación <span>${state.posts.length}</span></h3><button data-maint="select-posts" ${disabled}>Seleccionar primeras 100</button></div>${state.posts.length?state.posts.map(p=>`<label class="maintenance-row"><input type="checkbox" data-maint-post="${escapeHTML(p.id)}" ${state.postSelection.has(p.id)?'checked':''} ${disabled}><span><strong>${escapeHTML(p.title||p.id)}</strong><small>${escapeHTML(p.canton||'Cantón')} · ${day(p.createdAt)} · Sin reacciones ni comentarios</small></span></label>`).join(''):'<p class="maintenance-empty">No se encontraron publicaciones candidatas en las páginas revisadas.</p>'}</section><section><div class="maintenance-section-title"><h3>Cuentas inactivas <span>${state.users.length}</span></h3><button data-maint="select-users" ${disabled||(!state.users.some(u=>u.eligible)?'disabled':'')}>Seleccionar primeras 100</button></div>${state.users.length?state.users.map(u=>`<label class="maintenance-row"><input type="checkbox" data-maint-user="${escapeHTML(u.uid)}" ${state.userSelection.has(u.uid)?'checked':''} ${disabled||(!u.eligible?'disabled':'')}><span><strong>${escapeHTML(u.name)}</strong><small>Última actividad registrada: ${day(u.lastActiveAt)}${u.eligible?'':' · En margen inicial; no se eliminará'}</small></span></label>`).join(''):'<p class="maintenance-empty">No se encontraron cuentas con 30 días sin actividad registrada.</p>'}</section></div><p class="dash-note">Eliminar una cuenta Firebase no elimina su cuenta personal de Google. Al volver tendrá una nueva identidad en esta web. Se conservan las publicaciones que tengan participación y sus evidencias.</p></section>`;
 }
 function bind(container){
  container.querySelectorAll('[data-maint]').forEach(b=>b.onclick=()=>{const a=b.dataset.maint;if(a==='connect')void connect();if(a==='refresh')void refresh();if(a==='more')void refresh({more:true});if(a==='run')void run();if(a==='select-posts'){state.postSelection=new Set(state.posts.slice(0,100).map(p=>p.id));changed();}if(a==='select-users'){state.userSelection=new Set(state.users.filter(u=>u.eligible).slice(0,100).map(u=>u.uid));changed();}});
  container.querySelectorAll('[data-maint-post],[data-maint-user]').forEach(box=>box.onchange=()=>{const isPost=box.dataset.maintPost!==undefined,set=isPost?state.postSelection:state.userSelection,id=isPost?box.dataset.maintPost:box.dataset.maintUser;if(box.checked&&set.size>=100){state.message='Selecciona hasta 100 elementos de cada tipo.';}else if(box.checked)set.add(id);else set.delete(id);changed();});
 }
 return {view,bind,disconnect,directoryPage,authorizeDirectory:()=>connect(false),get connected(){return state.connected&&validAdmin()&&auth.currentUser.uid===connectedUid&&Date.now()<expires;},get busy(){return state.busy;}};
}
