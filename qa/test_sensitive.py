"""Contenido sensible: solo multimedia; texto y participación siempre visibles."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import sys
import io
from PIL import Image
root=Path(__file__).resolve().parents[1]
assets=root/'assets'
scripts=(assets/'cantons.js').read_text().replace('export const','const')+'\n'+(assets/'firebase-client.js').read_text().replace('export const','const').replace('export async function','async function').replace('export function','function')+'\n'+'\n'.join([line for line in (assets/'main.js').read_text().splitlines() if not line.startswith('import ')])
scripts=(assets/'media-ui.js').read_text().replace('export function','function')+'\n'+scripts
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in ([int(sys.argv[1])] if len(sys.argv)>1 else [320,390,768,1440]):
  page=browser.new_page(viewport={'width':width,'height':820})
  page.route('https://**/*',lambda route: route.abort())
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<!doctype html><html><head><title>Funados Todos B11</title></head><body><div id="app"></div><div id="modal-root"></div><div id="toasts"></div></body></html>')
  page.add_script_tag(content="""for(const key of ['localStorage','sessionStorage']){const map={};Object.defineProperty(window,key,{configurable:true,value:{getItem:k=>Object.hasOwn(map,k)?map[k]:null,setItem:(k,v)=>map[k]=String(v),removeItem:k=>delete map[k]}})};if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(36).slice(2).padEnd(10,'x');""")
  page.add_style_tag(content=(assets/'styles.css').read_text())
  page.add_script_tag(content='window.FUNADOS_FIREBASE_CONFIG={};\n'+scripts)
  page.get_by_role('button',name='Modo de invitado').click()
  page.locator('#guest-alias').fill('Prueba B11')
  page.get_by_role('button',name='Continuar',exact=True).click()
  page.get_by_role('button',name='Abrir funas de Marcabelí').click()
  page.get_by_role('button',name='Añadir funa').first.click()
  assert page.locator('#post-sensitive').count()==1
  assert not page.locator('#post-sensitive').is_checked(), 'Debe empezar desactivado'
  assert page.locator('#post-sensitive').is_disabled(), 'Sin archivos debe estar deshabilitado'
  title='Funa sensible de prueba para B11'
  description='Esta publicación de prueba contiene una descripción que no debe aparecer en la vista mientras no se revele.'
  page.locator('#post-title').fill(title)
  page.locator('#post-description').fill(description)
  out=io.BytesIO();Image.new('RGB',(2,2),(45,85,145)).save(out,format='PNG');tiny=out.getvalue()
  page.locator('#post-images').set_input_files({'name':'evidencia-prueba.png','mimeType':'image/png','buffer':tiny})
  assert page.locator('#post-sensitive').is_enabled()
  page.locator('#post-sensitive').check()
  page.locator('#post-images').set_input_files([])
  assert page.locator('#post-sensitive').is_disabled()
  assert not page.locator('#post-sensitive').is_checked()
  page.locator('#post-images').set_input_files({'name':'evidencia-prueba.png','mimeType':'image/png','buffer':tiny})
  page.locator('label[for="post-sensitive"]').click()
  assert page.locator('#post-sensitive').is_checked()
  page.get_by_role('button',name='Publicar',exact=True).click()
  page.locator('.sensitive-gate').first.wait_for(timeout=15000)
  post=page.locator('.report-card').first
  assert post.locator('.sensitive-gate').count()==1
  assert post.get_by_role('button',name='Ver contenido').count()==1
  assert post.locator('h2').first.inner_text()==title
  assert title in post.inner_text(), 'El título debe seguir visible'
  assert description in post.inner_text(), 'La descripción debe seguir visible'
  assert post.locator('.reactions-bar').count()==1
  assert post.locator('.report-images').count()==0, 'Evidencia visible antes de revelar'
  post.get_by_role('button',name='Ver contenido').click()
  post=page.locator('.report-card').first
  assert title in post.inner_text()
  assert description in post.inner_text()
  assert post.locator('.reactions-bar').count()==1
  assert post.locator('.report-images').count()==1, 'Evidencia no visible después de revelar'
  post.get_by_role('button',name='Ocultar contenido').click()
  post=page.locator('.report-card').first
  assert post.locator('.sensitive-gate').count()==1
  assert title in post.inner_text()
  assert description in post.inner_text()
  post.locator('[data-action=thread]').click()
  page.locator('#reply-text').fill('Comentario posible incluso antes de revelar las imágenes.')
  page.get_by_role('button',name='Publicar comentario').click()
  assert page.locator('#reply-text').input_value()==''
  assert page.locator('.reply-item').count()==1
  # Las fotos de seguimiento también respetan la cubierta, sin ocultar el texto.
  post.get_by_role('button',name='Ver actualizaciones de esta funa',exact=True).click()
  update='Seguimiento de prueba cuyo texto siempre debe permanecer visible.'
  page.locator('#update-text').fill(update)
  page.locator('#update-images').set_input_files({'name':'foto-actualizada.png','mimeType':'image/png','buffer':tiny})
  page.get_by_role('button',name='Publicar actualización').click()
  assert update in page.locator('.update-message').inner_text()
  assert page.locator('.update-message .sensitive-gate').count()==1
  assert page.locator('.update-message .carousel-slide').count()==0
  page.locator('.update-message').get_by_role('button',name='Ver contenido').click()
  assert page.locator('.update-message .carousel-slide').count()==1
  page.get_by_role('button',name='Volver a la funa').click()
  page.locator('.report-card').first.get_by_role('button',name='Ocultar contenido').click()
  page.evaluate("navigate('canton/marcabeli')")
  # Una funa normal debe seguir viéndose sin aviso.
  page.get_by_role('button',name='Añadir funa').first.click()
  assert not page.locator('#post-sensitive').is_checked()
  regular='Funa sin aviso de sensibilidad'
  page.locator('#post-title').fill(regular)
  page.locator('#post-description').fill('Reporte de prueba sin material sensible, que debe mostrarse normalmente y permitir comentarios y reacciones.')
  page.get_by_role('button',name='Publicar',exact=True).click()
  assert page.locator('.report-card').count()==2
  assert page.locator('.sensitive-gate').count()==1
  regular_post=page.locator('.report-card').filter(has_text=regular)
  assert regular_post.count()==1
  # Registros antiguos marcados sensibles sin archivos se muestran normalmente.
  page.evaluate("state.reports[0].sensitiveContent=true;render()")
  assert regular_post.locator('.sensitive-gate').count()==0
  # El mismo control se habilita con vídeo y se restablece al cerrar.
  page.get_by_role('button',name='Añadir funa').first.click()
  page.locator('#post-images').set_input_files({'name':'video.webm','mimeType':'video/webm','buffer':b'fixture'})
  assert page.locator('#post-sensitive').is_enabled()
  page.locator('#post-sensitive').check()
  page.locator('#modal-root [data-action=close]').click()
  page.get_by_role('button',name='Añadir funa').first.click()
  assert page.locator('#post-sensitive').is_disabled()
  assert not page.locator('#post-sensitive').is_checked()
  page.locator('#modal-root [data-action=close]').click()
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),f'Desbordamiento horizontal a {width}px'
  assert not errors,errors
  print('PASS B11',width,'px: texto visible, solo multimedia oculta, comentarios, imágenes/vídeo, sin archivos y registros antiguos')
  page.close()
 browser.close()
