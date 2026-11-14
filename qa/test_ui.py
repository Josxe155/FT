from pathlib import Path
from playwright.sync_api import sync_playwright
import sys
root=Path(__file__).resolve().parents[1]
assets=root/'assets'
scripts=(assets/'cantons.js').read_text().replace('export const','const')+'\n'+(assets/'firebase-client.js').read_text().replace('export const','const').replace('export async function','async function').replace('export function','function')+'\n'+'\n'.join((assets/'main.js').read_text().splitlines()[2:])
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
  page.add_script_tag(content='window.FUNADOS_FIREBASE_CONFIG={};\n'+scripts)
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
  # inline comments rather than modal
  page.get_by_role('button',name='Comentarios').click()
  assert page.locator('.inline-comments').count()==1
  assert page.locator('#modal-root .modal-overlay').count()==0
  page.locator('#reply-text').fill('Este comentario anónimo explica el problema observado.')
  page.get_by_role('button',name='Publicar comentario').click()
  assert page.locator('.inline-comments .reply-item').count()==1
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
  page.once('dialog',lambda d:d.accept())
  page.locator('.inline-comments .reply-item').first.get_by_role('button',name='Eliminar').click()
  assert page.locator('.inline-comments .reply-item').count()==1
  assert 'Comentario eliminado' not in page.locator('.inline-comments').inner_text()
  # comments toggled closed
  page.locator('.inline-comment-title [data-action="thread"]').click()
  assert page.locator('.inline-comments').count()==0
  # Updates existing modal
  page.get_by_role('button',name='Actualizaciones').click()
  assert page.locator('#update-form').count()==1
  page.locator('#update-text').fill('Nueva actualización publicada después de revisar el problema inicial.')
  page.get_by_role('button',name='Publicar actualización').click()
  assert page.locator('.update-item').count()==1
  page.get_by_role('button',name='Cerrar').first.click()
  # responsive + settings
  if width<=800:
   page.locator('.hamburger').click()
   assert page.locator('.side-panel').count()==1
   page.locator('.side-panel [data-page="ajustes"]').click()
  else:
   page.locator('.desktop-nav [data-page="ajustes"]').click()
  assert page.locator('h1').first.inner_text()=='Ajustes'
  assert page.locator('.signout-button').count()==1
  
  if not page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'):
   print('OVERFLOW',width,page.evaluate("[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,16).map(e=>({el:e.tagName,cl:e.className&&typeof e.className==='string'?e.className.slice(0,80):'',right:Math.round(e.getBoundingClientRect().right),w:Math.round(e.getBoundingClientRect().width)}))"))
  
  assert not errors,errors
  print('PASS',width,'px: login/canton/create/votes/inline comments/edit/delete/reply/updates/settings/mobile menu')
  page.close()
 b.close()
