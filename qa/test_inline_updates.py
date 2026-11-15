"""Seguimiento desplegable, adjuntos, contador, compartir y vídeo centrado."""
import json,io,os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
out=io.BytesIO();Image.new('RGB',(200,120),'#8060ac').save(out,format='PNG');photo=out.getvalue()
reports=[{'id':id,'canton':'machala','title':title,'description':'Descripción ficticia para revisar las novedades, fotos y acciones de una publicación.','status':'approved','category':'Funa','authorUid':owner,'authorAlias':'Anónimo','createdAt':1700000000000+i,'images':[],'media':[{'id':'0','ownerUid':owner,'name':'video.webm','type':'video/webm','size':3,'chunks':1}]} for i,(id,title,owner) in enumerate([('qa-inline-mine','Funa propia con novedades','qa-inline-user'),('qa-inline-other','Funa de otra persona','qa-other-user')])]
updates=[{'id':'u-'+r['id'],'reportId':r['id'],'text':'Novedad exclusiva para '+r['id'],'authorUid':r['authorUid'],'createdAt':1700000000010} for r in reports]
artifacts=Path(os.environ.get('QA_ARTIFACT_DIR','/tmp/funados-qa'));artifacts.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [320,390,768,1440]:
  page=browser.new_page(viewport={'width':width,'height':950});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('https://**/*',lambda route:route.abort())
  page.route('**/config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.FUNADOS_FIREBASE_CONFIG={};'))
  page.add_init_script('localStorage.setItem("funados_todos_reports_v3",'+json.dumps(json.dumps(reports))+');localStorage.setItem("funados_todos_updates_v6",'+json.dumps(json.dumps(updates))+');sessionStorage.setItem("funados_todos_guest_v3","qa-inline-user");Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>window.__qaCopied=text},configurable:true});')
  page.goto('http://127.0.0.1:5000/#/canton/machala')
  mine=page.locator('.report-card').filter(has=page.locator('[data-action=share][data-id=qa-inline-mine]'))
  other=page.locator('.report-card').filter(has=page.locator('[data-action=share][data-id=qa-inline-other]'))
  expect(mine.locator('[data-update-count]')).to_have_text('1')
  # Geometría real: icono centrado en el recuadro, grupo centrado en la evidencia.
  center=mine.locator('.carousel-slide').evaluate('''slide=>{const group=slide.querySelector('.evidence-video-prompt').getBoundingClientRect(),icon=slide.querySelector('.evidence-video-icon').getBoundingClientRect(),svg=slide.querySelector('.evidence-video-icon svg').getBoundingClientRect(),frame=slide.getBoundingClientRect();return {groupX:Math.abs(group.x+group.width/2-frame.x-frame.width/2),groupY:Math.abs(group.y+group.height/2-frame.y-frame.height/2),iconX:Math.abs(svg.x+svg.width/2-icon.x-icon.width/2),iconY:Math.abs(svg.y+svg.height/2-icon.y-icon.height/2)}}''')
  assert all(value<1.5 for value in center.values()),center
  mine.get_by_role('button',name='Ver actualizaciones de esta funa').click()
  expect(mine.locator('.inline-updates')).to_be_visible();expect(mine.locator('.update-message')).to_have_count(1)
  expect(page.locator('#modal-root')).to_be_empty();expect(mine.locator('#update-form')).to_be_visible()
  expect(mine.locator('.inline-updates')).not_to_contain_text('Novedad exclusiva para qa-inline-other')
  with page.expect_file_chooser() as chooser:page.get_by_role('button',name='Añadir fotos').click()
  chooser.value.set_files([{'name':'uno.png','mimeType':'image/png','buffer':photo},{'name':'dos.png','mimeType':'image/png','buffer':photo}])
  expect(page.locator('.update-selected-photo')).to_have_count(2)
  page.get_by_role('button',name='Quitar foto 1',exact=True).click();expect(page.locator('.update-selected-photo')).to_have_count(1)
  page.locator('#update-images').set_input_files([{'name':'tres.png','mimeType':'image/png','buffer':photo}]);expect(page.locator('.update-selected-photo')).to_have_count(2)
  page.locator('#update-text').fill('Nueva información con dos imágenes para todos los lectores.')
  page.get_by_role('button',name='Publicar actualización').click();expect(mine.locator('.update-message')).to_have_count(2)
  expect(mine.locator('[data-update-count]')).to_have_text('2');expect(page.locator('#update-text')).to_have_value('')
  expect(page.locator('.update-selected-photo')).to_have_count(0);expect(page.locator('.update-message .carousel-slide')).to_have_count(2)
  page.locator('.update-message .carousel-slide').first.click();expect(page.locator('.gallery-viewer')).to_be_visible();page.locator('.viewer-header [data-action=close]').click();expect(mine.locator('.inline-updates')).to_be_visible()
  # También se puede publicar solo fotos, sin rellenar un texto obligatorio.
  page.locator('#update-images').set_input_files([{'name':'solo-foto.png','mimeType':'image/png','buffer':photo}])
  assert not page.locator('#update-text').evaluate('(el)=>el.required')
  page.get_by_role('button',name='Publicar actualización').click()
  expect(mine.locator('.update-message')).to_have_count(3)
  expect(mine.locator('[data-update-count]')).to_have_text('3')
  expect(page.locator('.update-selected-photo')).to_have_count(0)
  page.wait_for_timeout(250);mine.screenshot(path=str(artifacts/f'inline-updates-{width}.png'))
  mine.get_by_role('button',name='Comentarios',exact=False).click();expect(mine.locator('.inline-updates')).to_have_count(0);expect(page.locator('#reply-text')).to_be_visible()
  other.get_by_role('button',name='Ver actualizaciones de esta funa').click();expect(page.locator('#reply-text')).to_have_count(0);expect(other.locator('.inline-updates')).to_be_visible();expect(page.locator('#update-form')).to_have_count(0)
  expect(other.locator('.inline-updates')).not_to_contain_text('Novedad exclusiva para qa-inline-mine')
  other.get_by_role('button',name='Compartir',exact=True).click();expect(page.get_by_role('dialog',name='Compartir publicación')).to_be_visible()
  page.get_by_role('button',name='Copiar enlace').click();expect(page.locator('.share-status')).to_contain_text('Enlace copiado');assert page.evaluate('window.__qaCopied').endswith('#/funa/qa-inline-other')
  page.locator('#modal-root [data-action=close]').click();expect(other.locator('.inline-updates')).to_be_visible()
  other.get_by_role('button',name='Reportar esta publicación').click();expect(page.locator('.flag-context')).to_contain_text('Funa de otra persona');page.locator('#flag-reason').select_option('Otro');page.locator('#flag-details').fill('Reporte ficticio de prueba sobre el contenido de esta publicación.');page.get_by_role('button',name='Enviar reporte').click();expect(page.locator('#flag-form')).to_have_count(0)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  assert not errors,errors
  print('PASS novedades',width,'px: contador, hilo por funa, fotos, miniaturas, lector, compartir, reportar y vídeo centrado')
  page.close()
 browser.close()
