"""Dashboard completo con servicios simulados: nunca usa datos ni tokens reales."""
import json,time,copy,os,io,base64,re
from PIL import Image
from urllib.parse import urlparse,parse_qs,unquote
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
PROJECT='funados-todos';PREFIX=f'projects/{PROJECT}/databases/(default)/documents/'
ADMIN='admin@example.test';NOW=int(time.time()*1000);DAY=86400000
from datetime import datetime,timezone
def stamp(ms):return datetime.fromtimestamp(ms/1000,timezone.utc).isoformat().replace('+00:00','Z')
def encode(v):
 if isinstance(v,bool):return {'booleanValue':v}
 if isinstance(v,int):return {'integerValue':str(v)}
 if isinstance(v,list):return {'arrayValue':{'values':[encode(item) for item in v]}}
 if isinstance(v,dict):return {'mapValue':{'fields':{k:encode(item) for k,item in v.items()}}}
 if v is None:return {'nullValue':None}
 return {'stringValue':str(v)}
def decode(v):
 if 'integerValue' in v:return int(v['integerValue'])
 return next(iter(v.values()),None)
def doc(path,**fields):return {'name':PREFIX+path,'fields':{k:encode(v) for k,v in fields.items()},'updateTime':stamp(NOW)}
class Backend:
 def __init__(self):
  self.docs={};self.rt={'activity':{'active':{'lastActiveAt':NOW}},'visits':{'active':{'firstSeen':NOW}},'evidence':{'idle-delete':{'old-delete':{'files':{'0':{'chunks':{'0':'YWJj'}}}}}},'evidenceUpdates':{'idle-delete':{'old-delete':{'update':{'files':{'0':{'chunks':{'0':'YWJj'}}}}}}}}
  self.users={u:{'localId':u,'email':ADMIN if u=='qa-admin' else '', 'displayName':u,'createdAt':str(NOW-60*DAY),'lastLoginAt':str(NOW-(1 if u in ['active','qa-admin'] else 40)*DAY)} for u in ['idle-delete','idle-return','active','qa-admin']}
  self.fail_once=set();self.deletions=[];self.put('maintenance/control',rolloutAt=stamp(NOW-31*DAY))
  for id,age in [('old-delete',31),('old-return',31),('wow',31),('commented',31)]+[(f'fresh-{n}',2) for n in range(55)]:
   self.put('reports/'+id,id=id,title='Prueba '+id+' <segura>',description='Descripción técnica ficticia para revisar el dashboard.',authorUid='idle-delete',status='approved',canton='machala',createdAt=stamp(NOW-age*DAY))
   self.docs['reports/'+id]['fields']['createdAt']={'timestampValue':stamp(NOW-age*DAY)}
   self.put('reports/'+id+'/reactionStats/summary',like=0,wow=1 if id=='wow' else 0,concern=0)
  self.put('reports/commented/replies/comment',text='Conversación activa')
  self.put('reports/old-delete/updates/update',text='Actualización ficticia')
  self.put('reports/old-delete/replies/missing/reactions/orphan',kind='none')
  self.put('flags/flag',reportId='old-delete',reason='Otro',createdAt=stamp(NOW),details='Texto ficticio')
  self.put('publishLimits/idle-delete',count=3)
  self.put('profiles/idle-delete',uid='idle-delete',tiktokUsername='test_only',alias='Anónimo')
  self.put('userPrefs/idle-delete',alias='Invitado')
  out=io.BytesIO();Image.new('RGB',(2,2),'#5b80b9').save(out,format='PNG');photo=out.getvalue()
  self.docs['reports/fresh-0']['fields']['media']=encode([{'id':'0','ownerUid':'idle-delete','name':'photo.png','type':'image/png','size':len(photo),'chunks':1}])
  self.setrt('evidence/idle-delete/fresh-0/files/0/chunks',{'0':base64.b64encode(photo).decode()})
 def put(self,path,**fields):self.docs[path]=doc(path,**fields)
 def getrt(self,path):
  value=self.rt
  for key in path.split('/') if path else []:
   if not isinstance(value,dict):return None
   value=value.get(key)
  return value
 def setrt(self,path,value):
  parts=path.split('/');target=self.rt
  for key in parts[:-1]:target=target.setdefault(key,{})
  if value is None:target.pop(parts[-1],None)
  else:target[parts[-1]]=value
 def direct(self,collection,missing=False):
  prefix=collection+'/'
  ids={p[len(prefix):].split('/')[0] for p in self.docs if p.startswith(prefix)}
  return [self.docs.get(prefix+i,{'name':PREFIX+prefix+i}) for i in sorted(ids) if missing or prefix+i in self.docs]
 def reply(self,route,data=None,status=200):route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,PUT,OPTIONS'},body=json.dumps(data if data is not None else {}))
 def api(self,route):
  req=route.request;url=urlparse(req.url);body=json.loads(req.post_data or '{}');path=unquote(url.path);params=parse_qs(url.query)
  if req.method=='OPTIONS':return self.reply(route,{})
  if 'identitytoolkit' in url.netloc:
   if path.endswith('accounts:batchGet'):
    start=int(params.get('nextPageToken',['0'])[0]);size=int(params.get('maxResults',['1000'])[0]);users=list(self.users.values());return self.reply(route,{'users':users[start:start+size],**({'nextPageToken':str(start+size)} if start+size<len(users) else {})})
   if path.endswith('accounts:lookup'):return self.reply(route,{'users':[self.users[u] for u in body.get('localId',[]) if u in self.users]})
   if path.endswith('accounts:delete'):
    self.deletions.append('auth/'+body['localId']);self.users.pop(body['localId'],None);return self.reply(route,{})
  if 'firebaseio' in url.netloc:
   rpath=path.lstrip('/').removesuffix('.json').strip('/')
   if req.method=='PATCH':
    for key,value in body.items():self.setrt(key,value)
   if req.method=='PUT':self.setrt(rpath,body)
   return self.reply(route,self.getrt(rpath))
  rel=path.split('/documents',1)[1].lstrip('/')
  if rel==':batchGet':
   return self.reply(route,[{'found':self.docs[name.split('/documents/')[1]]} if name.split('/documents/')[1] in self.docs else {'missing':name} for name in body.get('documents',[])])
  if rel==':beginTransaction':return self.reply(route,{'transaction':'qa-transaction'})
  if rel==':rollback':return self.reply(route,{})
  if rel==':commit':
   for w in body.get('writes',[]):
    if 'update' not in w:continue
    name=w['update']['name'];key=name.split('/documents/')[1]
    current=self.docs.get(key,{'name':name,'fields':{}})
    if w.get('currentDocument',{}).get('exists') is False and key in self.docs:return self.reply(route,{'error':{'message':'already exists'}},409)
    current['fields'].update(w['update'].get('fields',{}))
    for transform in w.get('updateTransforms',[]):current['fields'][transform['fieldPath']]={'timestampValue':stamp(NOW)}
    current['updateTime']=stamp(NOW);self.docs[key]=current
   return self.reply(route,{'writeResults':[]})
  if rel.endswith(':runQuery'):
   parent=rel.removesuffix(':runQuery').strip('/');q=body['structuredQuery'];collection=(parent+'/' if parent else '')+q['from'][0]['collectionId'];items=self.direct(collection)
   condition=q.get('where',{}).get('fieldFilter')
   if condition:
    field=condition['field']['fieldPath'];value=condition['value'];op=condition['op'];expected=decode(value)
    if op=='IN':items=[d for d in items if decode(d['fields'].get(field,{})) in [decode(v) for v in value['arrayValue']['values']]]
    elif op=='LESS_THAN_OR_EQUAL':items=[d for d in items if d['fields'].get(field,{}).get('timestampValue','9999')<=expected]
    else:items=[d for d in items if decode(d['fields'].get(field,{}))==expected]
   return self.reply(route,[{'document':d} for d in items[:q.get('limit',10000)]])
  if rel.endswith(':listCollectionIds'):
   parent=rel.removesuffix(':listCollectionIds')+'/';ids=sorted({p[len(parent):].split('/')[0] for p in self.docs if p.startswith(parent)})
   return self.reply(route,{'collectionIds':ids})
  if req.method=='DELETE':
   if rel in self.fail_once:self.fail_once.remove(rel);return self.reply(route,{'error':{'message':'Fallo temporal simulado'}},503)
   self.docs.pop(rel,None);self.deletions.append(rel);return self.reply(route,{})
  if len(rel.split('/'))%2:
   return self.reply(route,{'documents':self.direct(rel,params.get('showMissing')==['true'])})
  return self.reply(route,self.docs.get(rel,{'error':{'message':'not found'}}),200 if rel in self.docs else 404)
 def local(self,route):
  req=route.request;url=urlparse(req.url);path=unquote(parse_qs(url.query).get('path',[''])[0])
  if url.path.endswith('/data'):return self.reply(route,{'docs':self.docs})
  if url.path.endswith('/realtime'):
   if req.method=='POST':self.setrt(path,json.loads(req.post_data))
   return self.reply(route,0 if path=='.info/serverTimeOffset' else self.getrt(path))
  if url.path.endswith('/document'):return self.reply(route,self.docs.get(path))
  if url.path.endswith('/update'):
   values=json.loads(req.post_data);self.docs[path]['fields'].update({k:encode(v) for k,v in values.items()});return self.reply(route,{})
  if url.path.endswith('/delete'):self.docs.pop(path,None);return self.reply(route,{})
AUTH="""
export class GoogleAuthProvider{addScope(){} static credentialFromResult(){return {accessToken:'qa-fake-token'}}}
const user={uid:'qa-admin',email:window.__qaEmail||'admin@example.test',emailVerified:true,getIdTokenResult:async()=>({claims:{email_verified:true}})};
const auth={currentUser:user};export const getAuth=()=>auth;
export function onAuthStateChanged(a,cb){queueMicrotask(()=>cb(a.currentUser));return ()=>{}}
export const reauthenticateWithPopup=async()=>({user});export const signInWithPopup=async()=>({user});export const signOut=async()=>{auth.currentUser=null;location.reload()};
"""
FIRESTORE="""
const raw=v=>v?.arrayValue?(v.arrayValue.values||[]).map(raw):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,raw(x)])):v?.timestampValue?{toDate:()=>new Date(v.timestampValue),toMillis:()=>Date.parse(v.timestampValue)}:v?.integerValue!==undefined?Number(v.integerValue):v?.stringValue??v?.booleanValue??null;
const snap=d=>({id:d.name.split('/').pop(),data:()=>Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,raw(v)])),exists:()=>!!d.fields});
export const getFirestore=()=>({});export const collection=(_, ...parts)=>({path:parts.join('/')});export const doc=collection;
export const where=(field,op,value)=>({type:'where',field,op,value});export const orderBy=(field,direction)=>({type:'order',field,direction});export const limit=value=>({type:'limit',value});export const startAfter=value=>({type:'after',value});export const documentId=()=>'__name__';export const query=(ref,...constraints)=>({...ref,constraints});
async function items(q){const all=(await (await fetch('/__qa/data')).json()).docs;let list=Object.entries(all).filter(([p])=>p.startsWith(q.path+'/')&&p.split('/').length===q.path.split('/').length+1).map(([,d])=>snap(d));for(const c of q.constraints||[]){if(c.type==='where')list=list.filter(d=>d.data()[c.field]===c.value);if(c.type==='order')list.sort((a,b)=>{const x=c.field==='__name__'?a.id:a.data()[c.field]?.toMillis?.()||0,y=c.field==='__name__'?b.id:b.data()[c.field]?.toMillis?.()||0;return (x<y?-1:x>y?1:0)*(c.direction==='desc'?-1:1)});if(c.type==='after')list=list.slice(list.findIndex(x=>x.id===c.value.id)+1);if(c.type==='limit')list=list.slice(0,c.value)}return list}
export const getDocs=async q=>{const docs=await items(q);return {docs,size:docs.length,empty:!docs.length}};
export const getCountFromServer=async q=>({data:()=>({count:awaited})});
let awaited=0;export async function getDoc(r){const d=await (await fetch('/__qa/document?path='+encodeURIComponent(r.path))).json();return d?snap(d):{exists:()=>false}}
export const serverTimestamp=()=>new Date().toISOString();export async function updateDoc(r,v){await fetch('/__qa/update?path='+encodeURIComponent(r.path),{method:'POST',body:JSON.stringify(v)})}export async function deleteDoc(r){await fetch('/__qa/delete?path='+encodeURIComponent(r.path),{method:'DELETE'})}
""".replace("export const getCountFromServer=async q=>({data:()=>({count:awaited})});","export const getCountFromServer=async q=>{const list=await items(q);return {data:()=>({count:list.length})}};")
RTDB="""export const getDatabase=()=>({});export const ref=(_,path)=>({path});export async function get(r){const v=await (await fetch('/__qa/realtime?path='+encodeURIComponent(r.path))).json();return {val:()=>v,exists:()=>v!==null}}export async function set(r,v){await fetch('/__qa/realtime?path='+encodeURIComponent(r.path),{method:'POST',body:JSON.stringify(v)})}"""
artifacts=Path(os.environ.get('QA_ARTIFACT_DIR','/tmp/funados-qa'));artifacts.mkdir(parents=True,exist_ok=True)
def dashboard_module(route):
 # Sustituye únicamente la configuración del módulo servido en el entorno de QA.
 code=(Path(__file__).resolve().parents[1]/'web/assets/dashboard.js').read_text()
 code=re.sub(r"admin='[^']+'", "admin='admin@example.test'", code)
 route.fulfill(content_type='application/javascript',body=code)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [390,1440]:
  backend=Backend();page=browser.new_page(viewport={'width':width,'height':960});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda route:route.abort())
  page.route('https://firestore.googleapis.com/**',backend.api);page.route('https://identitytoolkit.googleapis.com/**',backend.api);page.route('https://funados-todos-default-rtdb.firebaseio.com/**',backend.api)
  page.route('**/__qa/**',backend.local)
  def sdk(route):
   name=route.request.url.split('/')[-1];code=AUTH if name=='firebase-auth.js' else FIRESTORE if name=='firebase-firestore.js' else RTDB if name=='firebase-database.js' else 'export const initializeApp=()=>({});'
   route.fulfill(content_type='application/javascript',body=code,headers={'Access-Control-Allow-Origin':'*'})
  page.route('https://www.gstatic.com/firebasejs/**',sdk);page.route('**/assets/dashboard.js*',dashboard_module)
  page.goto('http://127.0.0.1:5000/dashboard.html');expect(page.get_by_role('heading',name='Revisa, modera y recupera espacio.')).to_be_visible()
  expect(page.locator('tbody tr')).to_have_count(50);page.get_by_role('button',name='Cargar más',exact=True).click();expect(page.locator('tbody tr')).to_have_count(59)
  page.locator('#filter').fill('fresh-1');assert page.locator('#filter').evaluate('(e)=>e===document.activeElement');assert page.locator('tbody tr').count()<50
  page.locator('#filter').fill('fresh-0');page.locator('tbody tr').get_by_role('button',name='Ver',exact=True).click()
  page.locator('.dash-evidence-list [data-a=evidence]').click();expect(page.locator('.dash-evidence-viewer')).to_be_visible();page.wait_for_function('document.querySelector(".dash-evidence-viewer>img").naturalWidth>0')
  page.locator('[data-close-evidence]').click();expect(page.locator('.dash-evidence-viewer')).to_have_count(0)
  # Moderación: cancelar conserva el estado; revisar/retirar bloquea archivos,
  # volver a publicar los desbloquea. Solo registros ficticios.
  page.once('dialog',lambda d:d.dismiss());page.locator('tbody tr').get_by_role('button',name='Retirar',exact=True).click()
  assert backend.docs['reports/fresh-0']['fields']['status']['stringValue']=='approved'
  for button,status,blocked in [('Revisar','pending',True),('Retirar','rejected',True),('Publicar','approved',False)]:
   page.once('dialog',lambda d:d.accept());page.locator('tbody tr').get_by_role('button',name=button,exact=True).click()
   expect(page.locator('tbody tr').locator('td').nth(3)).to_have_text({'pending':'En revisión','rejected':'Retirada','approved':'Publicada'}[status])
   assert backend.docs['reports/fresh-0']['fields']['status']['stringValue']==status
   assert backend.getrt('blockedEvidence/fresh-0')==blocked
   page.locator('#filter').fill('fresh-0')
  page.get_by_role('button',name='Limpieza manual',exact=True).click();expect(page.get_by_role('button',name='Autorizar revisión con Google')).to_be_visible()
  page.get_by_role('button',name='Autorizar revisión con Google').click();expect(page.get_by_role('heading',name='Recupera espacio con control')).to_be_visible()
  expect(page.locator('[data-maint-post]')).to_have_count(2);expect(page.locator('[data-maint-user]')).to_have_count(2)
  page.wait_for_timeout(200);page.screenshot(path=str(artifacts/f'dashboard-{width}.png'),full_page=True)
  # Revisión y selección no borran datos; cancelar tampoco.
  page.locator('[data-maint=select-posts]').click();page.locator('[data-maint=select-users]').click();page.once('dialog',lambda dialog:dialog.dismiss());page.locator('[data-maint=run]').click();assert 'reports/old-delete' in backend.docs
  # Participación/actividad nueva después de revisar siempre se conserva.
  backend.put('reports/old-return/reactionStats/summary',like=1,wow=0,concern=0);backend.put('reports/old-return/reactions/visitor',kind='like');backend.setrt('activity/idle-return',{'lastActiveAt':NOW})
  page.once('dialog',lambda dialog:dialog.accept());page.locator('[data-maint=run]').click();expect(page.locator('.dash-status')).to_contain_text('Finalizado: 1 publicaciones y 1 cuentas eliminadas.',timeout=30000)
  assert 'reports/old-delete' not in backend.docs and 'reports/old-delete/updates/update' not in backend.docs
  assert 'reports/old-delete/replies/missing/reactions/orphan' not in backend.docs
  assert 'reports/old-return' in backend.docs and 'reports/wow' in backend.docs and 'reports/commented' in backend.docs
  assert backend.getrt('evidence/idle-delete/fresh-0/files/0/chunks') is not None
  assert 'idle-delete' not in backend.users and 'idle-return' in backend.users and 'qa-admin' in backend.users
  assert backend.getrt('evidenceUpdates/idle-delete/old-delete') is None
  assert 'profiles/idle-delete' not in backend.docs and 'userPrefs/idle-delete' not in backend.docs and 'publishLimits/idle-delete' not in backend.docs
  # Un fallo parcial deja un trabajo reanudable, sin fingir éxito.
  backend.put('reports/retry-post',id='retry-post',authorUid='active',status='approved',title='Prueba reanudable',createdAt=stamp(NOW-31*DAY));backend.docs['reports/retry-post']['fields']['createdAt']={'timestampValue':stamp(NOW-31*DAY)}
  backend.fail_once.add('reports/retry-post');page.locator('[data-maint=refresh]').click();expect(page.locator('[data-maint-post]')).to_have_count(1)
  page.locator('[data-maint=select-posts]').click();page.once('dialog',lambda dialog:dialog.accept());page.locator('[data-maint=run]').click();expect(page.locator('.dash-status')).to_contain_text('1 errores',timeout=30000)
  expect(page.locator('.retention-pending')).to_contain_text('1 trabajos')
  page.once('dialog',lambda dialog:dialog.accept());page.locator('[data-maint=run]').click();expect(page.locator('.dash-status')).to_contain_text('0 errores',timeout=30000);assert 'reports/retry-post' not in backend.docs
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  assert not errors,errors
  # Directorio privado: Google desde Auth, invitados desde userPrefs, paginación y escape.
  backend.users['qa-admin'].update({'displayName':'Ada Gómez','providerUserInfo':[{'providerId':'google.com','displayName':'Ada Gómez'}]})
  backend.put('userPrefs/active',uid='active',alias='Invitado <b>Seguro</b>')
  for n in range(55):backend.users['directory-'+str(n)]={'localId':'directory-'+str(n),'displayName':'Invitado de prueba '+str(n),'createdAt':str(NOW),'lastLoginAt':str(NOW)}
  page.get_by_role('button',name='Usuarios',exact=True).click();expect(page.locator('#user-rows tr')).to_have_count(50)
  page.get_by_role('button',name='Cargar más usuarios').click();expect(page.locator('#user-rows tr')).to_have_count(len(backend.users))
  page.locator('#user-filter').fill('Ada Gómez');expect(page.locator('#user-rows tr')).to_have_count(1);expect(page.locator('#user-rows')).to_contain_text('Google')
  page.locator('#user-filter').fill('Invitado <b>Seguro</b>');expect(page.locator('#user-rows tr')).to_have_count(1);expect(page.locator('#user-rows')).to_contain_text('Invitado <b>Seguro</b>');expect(page.locator('#user-rows b')).to_have_count(0)
  page.locator('#user-filter').fill('');page.wait_for_timeout(200);page.screenshot(path=str(artifacts/f'users-{width}.png'),full_page=True)
  assert 'profiles/active' not in backend.docs
  print('PASS directorio privado',width,'Google, apodo de invitado, paginación, búsqueda y escape HTML')
  print('PASS dashboard',width,'px: paginación, búsqueda, revisión, cancelación, cambios recientes, cascada y reanudación')
  page.close()
 # Acceso a Usuarios sin autorización previa: la consulta es solo lectura.
 backend=Backend();backend.users['qa-admin'].update({'displayName':'Ada Gómez','providerUserInfo':[{'providerId':'google.com'}]});backend.put('userPrefs/active',alias='Apodo privado')
 page=browser.new_page(viewport={'width':390,'height':900});page.route('https://**/*',lambda route:route.abort());page.route('https://firestore.googleapis.com/**',backend.api);page.route('https://identitytoolkit.googleapis.com/**',backend.api);page.route('https://funados-todos-default-rtdb.firebaseio.com/**',backend.api);page.route('**/__qa/**',backend.local);page.route('https://www.gstatic.com/firebasejs/**',sdk);page.route('**/assets/dashboard.js*',dashboard_module)
 page.goto('http://127.0.0.1:5000/dashboard.html');page.get_by_role('button',name='Usuarios',exact=True).click();expect(page.get_by_role('button',name='Autorizar consulta de usuarios')).to_be_visible();page.get_by_role('button',name='Autorizar consulta de usuarios').click();expect(page.locator('#user-rows')).to_contain_text('Apodo privado');assert len(backend.deletions)==0;assert len(backend.users)==4;page.close()
 print('PASS directorio: autorización privada sin ejecutar mantenimiento')
 # Las cuentas en margen se muestran, pero no se pueden seleccionar.
 for mode in ['grace','unauthorized']:
  backend=Backend();backend.docs['maintenance/control']['fields']['rolloutAt']={'timestampValue':stamp(NOW)}
  page=browser.new_page(viewport={'width':390,'height':900})
  page.route('https://**/*',lambda route:route.abort())
  page.route('https://firestore.googleapis.com/**',backend.api);page.route('https://identitytoolkit.googleapis.com/**',backend.api);page.route('https://funados-todos-default-rtdb.firebaseio.com/**',backend.api)
  page.route('**/__qa/**',backend.local);page.route('https://www.gstatic.com/firebasejs/**',sdk);page.route('**/assets/dashboard.js*',dashboard_module)
  if mode=='unauthorized':page.add_init_script("window.__qaEmail='other@example.com';")
  page.goto('http://127.0.0.1:5000/dashboard.html')
  if mode=='unauthorized':
   expect(page.locator('.dash-error')).to_contain_text('no tiene acceso administrativo');expect(page.locator('.dash-shell')).to_have_count(0)
  else:
   page.get_by_role('button',name='Limpieza manual',exact=True).click();page.locator('[data-maint=connect]').click();expect(page.locator('[data-maint-user]')).to_have_count(2)
   assert all(box.is_disabled() for box in page.locator('[data-maint-user]').all());assert page.locator('[data-maint=select-users]').is_disabled();assert len(backend.users)==4
  print('PASS dashboard',mode);page.close()
 browser.close()
