from pathlib import Path
from playwright.sync_api import sync_playwright
import sys
root=Path(__file__).resolve().parents[1]
assets=root/'assets'
scripts=(assets/'cantons.js').read_text().replace('export const','const')+'\n'+(assets/'firebase-client.js').read_text().replace('export const','const').replace('export async function','async function').replace('export function','function')+'\n'+'\n'.join([line for line in (assets/'main.js').read_text().splitlines() if not line.startswith('import ')])
scripts=(assets/'media-ui.js').read_text().replace('export function','function')+'\n'+scripts
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [int(sys.argv[1])] if len(sys.argv)>1 else [390]:
  page=b.new_page(viewport={'width':width,'height':800},accept_downloads=True)
  page.route('https://**/*', lambda route: route.abort())
  errors=[]
  page.on('pageerror',lambda exc: errors.append(str(exc)))
  page.set_content('<!doctype html><html><head><title>Funados Todos</title></head><body><div id="app"></div><div id="modal-root"></div><div id="toasts"></div></body></html>')
  page.add_script_tag(content="""for(const key of ['localStorage','sessionStorage']){const map={};Object.defineProperty(window,key,{configurable:true,value:{getItem:k=>Object.hasOwn(map,k)?map[k]:null,setItem:(k,v)=>map[k]=String(v),removeItem:k=>delete map[k]}})};if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(36).slice(2).padEnd(10,'x');""")
  page.add_style_tag(content=(assets/'styles.css').read_text())
  page.add_script_tag(content='window.FUNADOS_FIREBASE_CONFIG={};\n'+scripts.replace('const firebaseEnabled', 'let firebaseEnabled'))
  assert page.locator('h1').first.inner_text()=='Inicio de sesión'
  page.get_by_role('button',name='Modo de invitado').click()
  page.locator('#guest-alias').fill('Invitado V10')
  page.get_by_role('button',name='Continuar',exact=True).click()
  assert page.locator('.canton-card').count()==14
  page.get_by_role('button',name='Abrir funas de Marcabelí').click()
  page.get_by_role('button',name='Añadir funa').first.click()
  page.locator('#post-title').fill('Reporte de prueba sobre un servicio')
  page.locator('#post-description').fill('Este es un reporte comunitario de prueba sobre mantenimiento, sin mencionar ninguna persona.')
  page.get_by_role('button',name='Publicar',exact=True).click()
  assert page.locator('.report-card').count()==1
  # reactions first tap should update without waiting
  page.locator('.report-card .react-button[data-kind="like"]').click()
  assert page.locator('.report-card .react-button[data-kind="like"] .react-number').inner_text()=='1'
  page.locator('.report-card .react-button[data-kind="wow"]').click()
  assert page.locator('.report-card .react-button[data-kind="wow"] .react-number').inner_text()=='1'
  assert page.locator('[data-comment-count]').inner_text()=='0'
  # inline comments rather than modal
  page.get_by_role('button',name='Comentarios').click()
  assert page.locator('.inline-comments').count()==1
  assert page.locator('#modal-root .modal-overlay').count()==0
  page.locator('#reply-text').fill('Este comentario anónimo explica el problema observado.')
  page.locator('#reply-text').press('Enter')
  assert page.locator('.inline-comments .reply-item').count()==0
  assert '\n' in page.locator('#reply-text').input_value()
  page.get_by_role('button',name='Publicar comentario').click()
  assert page.locator('.inline-comments .reply-item').count()==1
  assert page.locator('[data-comment-count]').inner_text()=='1'
  assert page.locator('#reply-text').input_value()==''
  assert page.locator('#modal-root .modal-overlay').count()==0
  first=page.locator('.inline-comments .reply-item').first
  first.locator('[data-action="react-comment"][data-kind="like"]').click()
  assert first.locator('[data-kind="like"] .react-number').inner_text()=='1'
  first.get_by_role('button',name='Editar').click()
  page.locator('#edit-reply-text').fill('Este comentario fue corregido después de publicarse.')
  page.get_by_role('button',name='Guardar',exact=True).click()
  assert 'corregido' in page.locator('.inline-comments').inner_text()
  page.locator('.inline-comments .reply-item').first.get_by_role('button',name='Responder').click()
  page.locator('#reply-text').fill('Respuesta anónima de prueba al primer comentario.')
  page.get_by_role('button',name='Publicar respuesta').click()
  assert page.locator('.inline-comments .reply-item').count()==2
  assert page.locator('[data-comment-count]').inner_text()=='2'
  page.once('dialog',lambda d:d.accept())
  page.locator('.inline-comments .reply-item').first.get_by_role('button',name='Eliminar').click()
  assert page.locator('.inline-comments .reply-item').count()==1
  assert page.locator('[data-comment-count]').inner_text()=='1'
  assert 'Comentario eliminado' not in page.locator('.inline-comments').inner_text()
  # comments toggled closed
  page.locator('.inline-comment-title [data-action="thread"]').click()
  assert page.locator('.inline-comments').count()==0
  # Cambiar de publicación no debe llevarse el borrador al hilo equivocado.
  page.evaluate("state.reports.push({...state.reports[0],id:'qa-other-draft',title:'Otra publicación para comprobar el borrador'});render()")
  page.locator('[data-action=thread]').first.click()
  page.locator('#reply-text').fill('Este borrador pertenece únicamente a la primera publicación.')
  page.locator('[data-action=thread][data-id=qa-other-draft]').click()
  assert page.locator('#reply-text').input_value()=='','Un borrador no puede pasar a otra funa'
  page.evaluate("toggleInlineThread('qa-other-draft');state.reports=state.reports.filter(r=>r.id!=='qa-other-draft');render()")
  # Updates existing modal
  page.get_by_role('button',name='Ver actualizaciones de esta funa',exact=True).click()
  assert page.locator('#update-form').count()==1
  page.locator('#update-text').fill('Nueva actualización publicada después de revisar el problema inicial.')
  page.get_by_role('button',name='Publicar actualización').click()
  assert page.locator('#updates-feed>.update-card').count()==1
  assert page.locator('#update-text').input_value()==''
  page.get_by_role('button',name='Volver a la funa').click()
  # responsive + settings
  if width<=800:
   page.locator('.hamburger').click()
   assert page.locator('.side-panel').count()==1
   page.locator('.side-panel [data-page="ajustes"]').click()
  else:
   page.locator('.desktop-nav [data-page="ajustes"]').click()
  assert page.locator('h1').first.inner_text()=='Ajustes'
  assert page.locator('.signout-button').count()==1
  
  # Una actualización del contador/perfil no debe borrar el apodo que se escribe.
  page.locator('#alias-edit').fill('Borrador de apodo')
  page.evaluate('render()')
  assert page.locator('#alias-edit').input_value()=='Borrador de apodo'
  assert page.locator('#alias-edit').evaluate('(el)=>el===document.activeElement')
  # Un fallo remoto conserva el borrador y permite reintentar el comentario.
  page.evaluate('''() => {
    const post=state.reports[0];state.remoteReports=[post];state.remoteReplies=[];
    countReportReplies=async()=>state.remoteReplies.length;
    firebaseEnabled=true;navigate('funa/'+post.id);toggleInlineThread(post.id);
    let attempts=0;
    addNestedReply=async (reportId,text,user)=>{
      if(++attempts===1)throw new Error('Fallo de conexión simulado');
      state.remoteReplies.push({id:'retry-comment',reportId,text,authorUid:user.uid,
        authorAlias:'Anónimo',status:'approved',createdAt:Date.now()});
    };
  }''')
  page.locator('#reply-text').fill('Comentario que debe poder reintentarse después de un fallo.')
  page.get_by_role('button',name='Publicar comentario').click()
  assert page.locator('#reply-text').input_value()!=''
  assert page.locator('#reply-form').get_attribute('data-sending') is None
  page.get_by_role('button',name='Publicar comentario').click()
  assert page.locator('.reply-item').count()==1
  assert page.locator('#reply-text').input_value()==''
  # Firestore puede reemplazar el formulario antes de resolver la escritura.
  page.evaluate("""() => {
    window.__qaReplyAttempts=0;
    addNestedReply=async (reportId,text,user,parent)=>{
      window.__qaReplyAttempts++;
      state.remoteReplies.push({id:'racing-comment',reportId,text,authorUid:user.uid,
        authorAlias:'Anónimo',status:'approved',createdAt:Date.now(),...(parent?{parentId:parent}:{})});
      renderInlineThread();
      await new Promise(resolve=>window.__qaReplyResolve=resolve);
    };
  }""")
  assert page.locator('label[for=reply-text]').inner_text()=='Comentar'
  page.locator('[data-action=reply-to]').first.click()
  page.locator('#reply-text').fill('Respuesta con formulario reemplazado por actualización remota.')
  page.get_by_role('button',name='Publicar respuesta').click()
  assert page.locator('#reply-text').is_disabled()
  page.locator('#reply-form').evaluate('(form)=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
  assert page.evaluate('window.__qaReplyAttempts')==1
  page.evaluate('window.__qaReplyResolve()')
  page.wait_for_function('document.querySelector("#reply-text").value==="" && !document.querySelector("#reply-text").disabled')
  assert page.locator('.reply-item').count()==2
  # La escucha de novedades actualiza solo el hilo, sin sustituir el formulario.
  page.evaluate("""() => {
    countFunaUpdates=async()=>1;
    listenFunaUpdates=(id,onData,onError)=>{window.__qaUpdates=onData;window.__qaUpdatesError=onError;return ()=>{};};
    openUpdates(state.remoteReports[0].id);
  }""")
  page.locator('#update-text').fill('Borrador con una foto que debe sobrevivir a la escucha remota.')
  page.locator('#update-images').set_input_files(str(root/'source/public/assets/icon-192.png'))
  page.evaluate("""() => {
    window.__qaUpdateInput=document.querySelector('#update-text');
    window.__qaUpdates([{id:'first-update',reportId:state.updatesPost,text:'Primera novedad remota.',authorUid:state.user.uid,createdAt:Date.now()}]);
  }""")
  assert page.evaluate('window.__qaUpdateInput===document.querySelector("#update-text")')
  assert page.locator('.update-selected-photo').count()==1
  assert page.locator('#update-text').input_value().startswith('Borrador')
  page.evaluate("""() => {
    window.__qaUpdateAttempts=0;
    addFunaUpdate=async(id,text,files)=>{
      window.__qaUpdateAttempts++;window.__qaUploadedPhotos=files.length;
      await new Promise(resolve=>window.__qaUpdateResolve=resolve);return {};
    };
  }""")
  page.get_by_role('button',name='Publicar actualización').click()
  page.locator('#update-form').evaluate('(form)=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
  assert page.evaluate('window.__qaUpdateAttempts')==1
  page.evaluate("window.__qaUpdates([{id:'first-update',reportId:state.updatesPost,text:'Nueva instantánea durante el envío.',authorUid:state.user.uid,createdAt:Date.now()}])")
  assert page.locator('#update-text').is_disabled()
  page.evaluate('window.__qaUpdateResolve()')
  page.wait_for_function('!document.querySelector("#update-text").disabled')
  assert page.locator('#update-text').input_value()==''
  assert page.locator('.update-selected-photo').count()==0
  assert page.evaluate('window.__qaUploadedPhotos')==1
  # Un enlace inexistente finaliza con un estado claro.
  page.evaluate("firebaseEnabled=false;navigate('funa/no-existe')")
  assert page.get_by_role('heading',name='Publicación no disponible').is_visible()

  if not page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'):
   print('OVERFLOW',width,page.evaluate("[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,16).map(e=>({el:e.tagName,cl:e.className&&typeof e.className==='string'?e.className.slice(0,80):'',right:Math.round(e.getBoundingClientRect().right),w:Math.round(e.getBoundingClientRect().width)}))"))
  
  assert not errors,errors
  print('PASS',width,'px: login/canton/create/votes/inline comments/edit/delete/reply/updates/settings/mobile menu')
  page.close()
 b.close()
