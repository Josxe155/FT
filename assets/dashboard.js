import {videoPlayerMarkup,safeMediaFilename} from './media-ui.js';
import {createMaintenance} from './dashboard-maintenance.js';
const cfg=window.FUNADOS_FIREBASE_CONFIG||{},admin='alexander155alvarado@gmail.com',root=document.getElementById('dash-app'),cdn='https://www.gstatic.com/firebasejs/11.10.0';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{const d=v?.toDate?v.toDate():new Date(v||0);return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-EC');};
let auth,db,rtdb,mod,maintenance,tab='posts',filter='',notice='',busy=false,refreshTimer,activeUid='',generation=0,evidenceBusy=false;
let data={reports:[],flags:[],profiles:[],visits:0},totals={reports:0,approved:0,pending:0,rejected:0,flags:0,profiles:0},lastUpdated=null;
const cursors={posts:null,flags:null,profiles:null},more={posts:false,flags:false,profiles:false};
const names={posts:'Publicaciones',flags:'Reportes',profiles:'TikTok',maintenance:'Limpieza manual'};
async function allowed(user){return !!user&&user.emailVerified&&user.email?.toLowerCase()===admin&&(await user.getIdTokenResult()).claims.email_verified===true;}
function login(error=''){
 clearInterval(refreshTimer);maintenance?.disconnect();activeUid='';generation++;
 root.innerHTML=`<main class="dash-center"><section class="dash-auth"><img class="dash-logo" src="./assets/logo.svg?v=20261115b" alt="Funados Todos"><p class="dash-kicker">FUNADOS TODOS</p><h1>Centro de moderación</h1><p>Accede con la cuenta administradora verificada para revisar publicaciones, reportes y espacio.</p><button id="google" class="dash-primary" ${!mod?'disabled':''}>Continuar con Google</button><p class="dash-error" role="status">${safe(error)}</p><a href="/" class="dash-return">Volver a la comunidad</a></section></main>`;
 root.querySelector('#google').onclick=async()=>{try{await mod.auth.signInWithPopup(auth,new mod.auth.GoogleAuthProvider());}catch(e){login('No se pudo iniciar sesión: '+(e?.code||'comprueba la conexión'));}};
}
const current=()=>tab==='flags'?data.flags:tab==='profiles'?data.profiles:data.reports;
const fields={posts:[['Fecha',x=>date(x.createdAt)],['Cantón',x=>x.canton],['Título',x=>x.title],['Estado',x=>({approved:'Publicada',pending:'En revisión',rejected:'Retirada',deleting:'En limpieza'}[x.status]||x.status)]],flags:[['Fecha',x=>date(x.createdAt)],['Publicación',x=>x.reportId],['Motivo',x=>x.reason],['Detalle',x=>x.details||'—']],profiles:[['TikTok',x=>'@'+x.tiktokUsername],['Alias',x=>x.alias||'Anónimo'],['Actualizado',x=>date(x.updatedAt)]]};
function actions(x){if(tab==='posts'&&x.status==='deleting')return '<span class="dash-chip">En limpieza</span>';if(tab==='posts')return `<button data-a="detail" data-id="${safe(x.id)}">Ver</button><button data-a="approve" data-id="${safe(x.id)}" ${x.status==='approved'?'disabled':''}>Publicar</button><button data-a="pending" data-id="${safe(x.id)}" ${x.status==='pending'?'disabled':''}>Revisar</button><button class="danger" data-a="reject" data-id="${safe(x.id)}" ${x.status==='rejected'?'disabled':''}>Retirar</button>`;if(tab==='flags')return `<button data-a="flag-post" data-id="${safe(x.reportId)}">Ver publicación</button><button class="danger" data-a="delete-flag" data-id="${safe(x.id)}">Eliminar reporte</button>`;return `<a class="dash-external" target="_blank" rel="noopener noreferrer" href="https://www.tiktok.com/@${encodeURIComponent(x.tiktokUsername||'')}">Abrir perfil ↗</a>`;}
function table(items){return `<div class="dash-table-wrap"><table class="dash-table"><thead><tr>${fields[tab].map(x=>`<th scope="col">${x[0]}</th>`).join('')}<th scope="col">ACCIONES</th></tr></thead><tbody>${items.length?items.map(x=>`<tr>${fields[tab].map(([,f])=>`<td>${safe(f(x))}</td>`).join('')}<td class="dash-row-actions">${actions(x)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="dash-empty">${filter?'No hay coincidencias en los registros cargados.':'Todavía no hay registros en esta sección.'}</div></td></tr>`}</tbody></table></div>`;}
function render(){
 if(!activeUid)return;
 const selected=tab==='maintenance',visible=current().filter(x=>JSON.stringify(x).toLowerCase().includes(filter.toLowerCase()));
 root.innerHTML=`<main class="dash-shell"><header class="dash-header"><a class="dash-brand" href="/"><img src="./assets/logo.svg?v=20261115b" alt="Logotipo Funados Todos"><div><strong>Funados <em>Todos</em></strong><small>Centro de moderación</small></div></a><div class="dash-header-actions"><span class="dash-last-update">${lastUpdated?'Actualizado '+lastUpdated.toLocaleTimeString('es-EC'):'Preparando datos'}</span><button class="dash-btn" id="refresh" ${busy||maintenance?.busy?'disabled':''}>${busy?'Actualizando…':'Actualizar'}</button><button class="dash-btn danger-outline" id="logout" ${maintenance?.busy?'disabled':''}>Cerrar sesión</button></div></header><section class="dash-hero"><div><p class="dash-kicker">CONTROL DE LA COMUNIDAD</p><h1>Revisa, modera y recupera espacio.</h1><p>Publicaciones y reportes, con decisiones claras y una limpieza manual que puedes revisar antes de ejecutar.</p></div><div class="dash-visit"><small>VISITANTES ÚNICOS</small><strong>${data.visits}</strong><span>registros conservados en Firebase</span></div></section><section class="dash-metrics">${[['Publicaciones',totals.reports],['Publicadas',totals.approved],['En revisión',totals.pending],['Retiradas',totals.rejected],['TikTok',totals.profiles],['Reportes',totals.flags]].map(([label,n])=>`<div class="dash-metric"><span>${label}</span><strong>${n}</strong></div>`).join('')}</section><nav class="dash-tabs" aria-label="Secciones de administración">${Object.entries(names).map(([key,name])=>`<button data-tab="${key}" aria-current="${tab===key?'page':'false'}" class="${tab===key?'active':''}">${name}</button>`).join('')}</nav><section class="dash-panel">${selected?maintenance?.view()||'<p>Preparando mantenimiento…</p>':`<div class="dash-panel-title"><div><p class="dash-kicker">GESTIÓN</p><h2>${names[tab]}</h2></div><label class="dash-search-label"><span class="visually-hidden">Buscar en registros cargados</span><input id="filter" class="dash-search" type="search" placeholder="Buscar en registros cargados" value="${safe(filter)}"></label></div><p class="dash-status" role="status">${safe(notice)}</p><div id="table-region">${table(visible)}</div><div class="dash-pager"><small>${current().length} registros cargados. ${more[tab]?'Hay más páginas.':'Fin de la lista.'}</small>${more[tab]?`<button class="dash-btn" id="load-more" ${busy?'disabled':''}>Cargar más</button>`:''}</div><section id="detail" class="dash-detail" hidden aria-label="Detalle de publicación"></section>`}</section><p class="dash-note">Los recuentos son del servidor. Las listas se actualizan cada minuto mientras esta pestaña está visible; la revisión de limpieza se actualiza con su propio botón.</p></main>`;
 root.querySelector('#logout').onclick=async()=>{try{await mod.auth.signOut(auth);}catch(e){notice=e.message;render();}};
 root.querySelector('#refresh').onclick=()=>load();
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;filter='';render();});
 if(selected){maintenance?.bind(root);return;}
 root.querySelector('#filter').oninput=e=>{filter=e.target.value;root.querySelector('#table-region').innerHTML=table(current().filter(x=>JSON.stringify(x).toLowerCase().includes(filter.toLowerCase())));bindActions();};
 root.querySelector('#load-more')?.addEventListener('click',()=>loadPage(tab,true));bindActions();
}
function bindActions(){root.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await action(b.dataset.a,b.dataset.id,b.dataset.file);}catch(e){notice='No se pudo completar la acción: '+(e?.message||e?.code||'comprueba la conexión');render();}finally{b.disabled=false;}});}
async function fetchPage(section,append=false){
 const f=mod.fs,collection=section==='posts'?'reports':section;
 const constraints=section==='profiles'?[f.orderBy(f.documentId())]:[f.orderBy('createdAt','desc')];
 if(append&&cursors[section])constraints.push(f.startAfter(cursors[section]));constraints.push(f.limit(50));
 const snap=await f.getDocs(f.query(f.collection(db,collection),...constraints));
 cursors[section]=snap.docs.at(-1)||null;more[section]=snap.size===50;
 const key=section==='posts'?'reports':section,items=snap.docs.map(x=>({...x.data(),id:x.id}));
 data[key]=append?[...new Map([...data[key],...items].map(x=>[x.id,x])).values()]:items;
}
async function loadPage(section,append=false){if(busy||maintenance?.busy)return;busy=true;render();try{await fetchPage(section,append);notice='';}catch(e){notice=e.message;}finally{busy=false;render();}}
async function load(quiet=false){
 if(busy||maintenance?.busy||!activeUid)return;if(quiet&&(filter||document.activeElement?.id==='filter'||root.querySelector('#detail:not([hidden]),dialog[open]')))return;busy=true;const version=generation;
 if(!quiet){notice='Actualizando datos…';render();}
 try{
  const f=mod.fs,count=async(...c)=> (await f.getCountFromServer(f.query(f.collection(db,c[0]),...c.slice(1)))).data().count;
  const results=await Promise.allSettled([fetchPage('posts'),fetchPage('flags'),fetchPage('profiles'),mod.rtdb.get(mod.rtdb.ref(rtdb,'visits')),Promise.all([count('reports'),count('reports',f.where('status','==','approved')),count('reports',f.where('status','==','pending')),count('reports',f.where('status','==','rejected')),count('flags'),count('profiles')])]);
  if(version!==generation)return;
  if(results[3].status==='fulfilled')data.visits=Object.keys(results[3].value.val()||{}).length;
  if(results[4].status==='fulfilled'){const [reports,approved,pending,rejected,flags,profiles]=results[4].value;totals={reports,approved,pending,rejected,flags,profiles};}
  const failed=results.filter(x=>x.status==='rejected');notice=failed.length?'Algunos datos no pudieron actualizarse. Vuelve a intentarlo.':'';lastUpdated=new Date();
 }catch(e){notice='No se pudieron actualizar los datos: '+(e?.code||'comprueba la conexión');}
 finally{busy=false;if(version===generation&&!(quiet&&tab==='maintenance'))render();}
}
async function detail(id){const f=mod.fs,r=await f.getDoc(f.doc(db,'reports',id)),el=root.querySelector('#detail');el.hidden=false;if(!r.exists()){el.textContent='La publicación ya no está disponible.';return;}const d=r.data();el.innerHTML=`<div class="dash-detail-title"><h3>Detalle de publicación</h3><button class="dash-btn" data-close-detail>Cerrar</button></div><h4>${safe(d.title)}</h4><p>${safe(d.description)}</p><div class="dash-detail-meta"><span>${safe(d.canton)}</span><span>${safe(d.status)}</span><span>${date(d.createdAt)}</span></div>${Array.isArray(d.media)&&d.media.length?`<div class="dash-evidence-list">${d.media.filter(m=>m&&m.ownerUid===d.authorUid).map(m=>`<button class="dash-btn" data-a="evidence" data-id="${safe(id)}" data-file="${safe(m.id)}">${String(m.type).startsWith('video/')?'▶':'▧'} ${safe(m.name)}</button>`).join('')}</div>`:''}<a href="/#/funa/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">Abrir publicación y evidencias ↗</a>`;el.querySelector('[data-close-detail]').onclick=()=>el.hidden=true;bindActions();el.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function evidence(id,file){
 if(evidenceBusy)return;evidenceBusy=true;
 try{
  const report=await mod.fs.getDoc(mod.fs.doc(db,'reports',id));if(!report.exists())throw new Error('La publicación no existe.');
  const data=report.data(),item=(Array.isArray(data.media)?data.media:[]).find(m=>m.id===file&&m.ownerUid===data.authorUid);
  if(!item||!Number.isInteger(item.size)||item.size<1||item.size>10485760||!Number.isInteger(item.chunks)||item.chunks<1||item.chunks>214||!/^image\/(png|jpeg|webp)$|^video\/(mp4|webm|quicktime)$/.test(item.type))throw new Error('Metadatos de evidencia no válidos.');
  const snapshot=await mod.rtdb.get(mod.rtdb.ref(rtdb,`evidence/${item.ownerUid}/${id}/files/${file}/chunks`)),blocks=snapshot.val();
  if(!blocks)throw new Error('La evidencia ya no está disponible.');
  const parts=[];let total=0;
  for(let i=0;i<item.chunks;i++){const raw=blocks[String(i)];if(typeof raw!=='string'||raw.length>65536)throw new Error('Archivo incompleto.');const decoded=atob(raw),bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));total+=bytes.length;if(total>item.size)throw new Error('Tamaño de archivo incoherente.');parts.push(bytes);}
  if(total!==item.size)throw new Error('Archivo incompleto.');
  const url=URL.createObjectURL(new Blob(parts,{type:item.type})),dialog=document.createElement('dialog');dialog.className='dash-evidence-viewer';
  dialog.innerHTML=`<div class="viewer-header"><strong>${safe(item.name)}</strong><button class="dash-btn" data-close-evidence>Cerrar</button></div>${item.type.startsWith('video/')?videoPlayerMarkup(url):`<img src="${url}" alt="Evidencia de la publicación">`}<div class="viewer-footer"><a href="${url}" download="${safe(safeMediaFilename(item.name,item.type))}">Descargar original</a></div>`;
  dialog.querySelector('[data-close-evidence]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{const video=dialog.querySelector('video');video?.pause();if(document.pictureInPictureElement===video)void document.exitPictureInPicture().catch(()=>{});URL.revokeObjectURL(url);dialog.remove();},{once:true});
  root.append(dialog);dialog.showModal();
 }finally{evidenceBusy=false;}
}
async function action(kind,id,file){
 if(!await allowed(auth.currentUser))throw new Error('Vuelve a iniciar sesión como administrador.');
 if(kind==='evidence'){await evidence(id,file);return;}
 if(kind==='detail'||kind==='flag-post'){await detail(id);return;}
 if(kind==='delete-flag'){if(!confirm('¿Eliminar este reporte de moderación? La publicación no se borrará.'))return;await mod.fs.deleteDoc(mod.fs.doc(db,'flags',id));await load();return;}
 const status={approve:'approved',pending:'pending',reject:'rejected'}[kind];if(!status||!confirm(status==='rejected'?'¿Retirar esta publicación y bloquear sus evidencias?':'¿Cambiar el estado de esta publicación?'))return;
 // Para publicar, primero actualizar Firestore y desbloquear al final. Para retirar, bloquear primero.
 if(status!=='approved')await mod.rtdb.set(mod.rtdb.ref(rtdb,`blockedEvidence/${id}`),true);
 await mod.fs.updateDoc(mod.fs.doc(db,'reports',id),{status,reviewedAt:mod.fs.serverTimestamp()});
 if(status==='approved')await mod.rtdb.set(mod.rtdb.ref(rtdb,`blockedEvidence/${id}`),false);
 await load();
}
async function init(){
 if(!cfg.apiKey||!cfg.projectId)return login('Falta configurar Firebase.');
 try{
  const [app,a,f,r]=await Promise.all([import(`${cdn}/firebase-app.js`),import(`${cdn}/firebase-auth.js`),import(`${cdn}/firebase-firestore.js`),import(`${cdn}/firebase-database.js`)]),instance=app.initializeApp(cfg,'adminDashboard');auth=a.getAuth(instance);db=f.getFirestore(instance);rtdb=r.getDatabase(instance,cfg.databaseURL);mod={auth:a,fs:f,rtdb:r};
  maintenance=createMaintenance({cfg,auth,rtdb,mod,admin,onChange:()=>{if(tab==='maintenance')render();},onFinished:()=>load()});
  a.onAuthStateChanged(auth,async user=>{try{if(!await allowed(user))return login(user?'Esta cuenta no tiene acceso administrativo.':'');activeUid=user.uid;generation++;root.innerHTML='<main class="dash-center"><div class="dash-spinner"></div><p>Cargando panel…</p></main>';await load();clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(document.visibilityState==='visible'&&tab!=='maintenance')void load(true);},60000);}catch(e){login('No se pudo comprobar el acceso: '+(e?.code||'comprueba la conexión'));}});
 }catch{login('No se pudo cargar Firebase. Comprueba tu conexión.');}
}
init();
