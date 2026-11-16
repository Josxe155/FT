"""Vista de novedades como feed de funas y centrado del marco multimedia completo."""
import json,io,os,base64,subprocess,tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
def png(size,color):
 out=io.BytesIO();Image.new('RGB',size,color).save(out,format='PNG');return out.getvalue()
photo=png((200,120),'#8060ac');wide=png((2000,200),'#4678ad');tall=png((200,1600),'#af687d')
def data(mime,raw):return 'data:'+mime+';base64,'+base64.b64encode(raw).decode()
with tempfile.TemporaryDirectory() as temp:
 clip=Path(temp)/'fixture.webm';subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x355a9b:s=320x180:r=15','-t','4','-c:v','libvpx-vp9','-an','-y',str(clip)],check=True);video=clip.read_bytes()
reports=[{'id':id,'canton':'machala','title':title,'description':'Descripción ficticia para revisar las novedades, fotos y acciones de una publicación.','status':'approved','category':'Funa','authorUid':owner,'authorAlias':'Anónimo','createdAt':1700000000000+i,'images':[] if i==0 else [data('image/png',wide),data('image/png',tall)],'media':[{'id':'0','ownerUid':owner,'name':'video.webm','type':'video/webm','size':len(video),'chunks':1,'localUrl':data('video/webm',video)}] if i==0 else []} for i,(id,title,owner) in enumerate([('qa-inline-mine','Funa propia con novedades','qa-inline-user'),('qa-inline-other','Funa de otra persona','qa-other-user')])]
updates=[{'id':'u-'+r['id'],'reportId':r['id'],'text':'Novedad exclusiva para '+r['id'],'authorUid':r['authorUid'],'createdAt':1700000000010} for r in reports]
artifacts=Path(os.environ.get('QA_ARTIFACT_DIR','/tmp/funados-qa'));artifacts.mkdir(parents=True,exist_ok=True)
def centered(page,selector,ancestor=None):
 result=page.locator(selector).evaluate('''(el,parent)=>{const b=el.getBoundingClientRect(),p=parent?el.closest(parent).getBoundingClientRect():{x:0,y:0,width:innerWidth,height:innerHeight};return {x:Math.abs(b.x+b.width/2-p.x-p.width/2),y:Math.abs(b.y+b.height/2-p.y-p.height/2)}}''',ancestor)
 assert result['x']<1.5,(selector,result)
 if ancestor is None or (ancestor=='.viewer-stage' and selector!='.viewer-stage video'):assert result['y']<1.5,(selector,result)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,950),(390,950),(768,950),(1440,950),(844,390)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('https://**/*',lambda route:route.abort());page.route('**/config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.FUNADOS_FIREBASE_CONFIG={};'))
  page.add_init_script('localStorage.setItem("funados_todos_reports_v3",'+json.dumps(json.dumps(reports))+');localStorage.setItem("funados_todos_updates_v6",'+json.dumps(json.dumps(updates))+');sessionStorage.setItem("funados_todos_guest_v3","qa-inline-user");Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>window.__qaCopied=text},configurable:true});')
  page.goto('http://127.0.0.1:5000/#/canton/machala')
  mine=page.locator('.report-card[data-open-updates=qa-inline-mine]');other=page.locator('.report-card[data-open-updates=qa-inline-other]')
  expect(mine.locator('[data-update-count]')).to_have_text('1');expect(page.get_by_role('button',name='Actualizaciones',exact=True)).to_have_count(0)
  expect(mine.locator('.report-bottom button')).to_have_count(3)
  centered(page,'[data-open-updates=qa-inline-mine] .media-carousel','.report-card')
  mine.locator('.carousel-slide').click();page.wait_for_function('document.querySelector(".video-player video")?.duration>0');page.wait_for_timeout(250)
  centered(page,'.gallery-viewer');centered(page,'.viewer-stage .video-player','.viewer-stage');centered(page,'.viewer-stage video','.viewer-stage')
  page.locator('.viewer-header [data-action=close]').click()
  # Tocar el texto de una funa abre una página propia; no un modal ni acordeón.
  mine.locator('.report-copy').click();expect(page).to_have_url('http://127.0.0.1:5000/#/actualizaciones/qa-inline-mine')
  expect(page.locator('h1')).to_have_text('Actualizaciones');expect(page.locator('#updates-feed>.update-card')).to_have_count(1)
  expect(page.locator('#updates-feed')).not_to_contain_text('Descripción ficticia');expect(page.locator('#updates-feed')).not_to_contain_text('Novedad exclusiva para qa-inline-other')
  expect(page.locator('#modal-root')).to_be_empty();expect(page.locator('#update-form')).to_be_visible();expect(page.locator('.inline-updates')).to_have_count(0)
  with page.expect_file_chooser() as chooser:page.get_by_role('button',name='Añadir fotos').click()
  chooser.value.set_files([{'name':'uno.png','mimeType':'image/png','buffer':photo},{'name':'dos.png','mimeType':'image/png','buffer':photo}]);expect(page.locator('.update-selected-photo')).to_have_count(2)
  page.get_by_role('button',name='Quitar foto 1',exact=True).click();page.locator('#update-images').set_input_files([{'name':'tres.png','mimeType':'image/png','buffer':photo}]);expect(page.locator('.update-selected-photo')).to_have_count(2)
  page.locator('#update-text').fill('Nueva información con dos imágenes para todos los lectores.');page.get_by_role('button',name='Publicar actualización').click();expect(page.locator('#updates-feed>.update-card')).to_have_count(2)
  expect(page.locator('[data-update-total]')).to_have_text('2');expect(page.locator('#update-text')).to_have_value('');expect(page.locator('.update-selected-photo')).to_have_count(0)
  page.locator('.update-card .carousel-slide').first.click();expect(page.locator('.gallery-viewer')).to_be_visible();page.wait_for_timeout(250);centered(page,'.gallery-viewer');centered(page,'.viewer-stage>img','.viewer-stage');page.locator('.viewer-header [data-action=close]').click()
  page.locator('#update-images').set_input_files([{'name':'solo-foto.png','mimeType':'image/png','buffer':photo}]);assert not page.locator('#update-text').evaluate('(el)=>el.required');page.get_by_role('button',name='Publicar actualización').click();expect(page.locator('#updates-feed>.update-card')).to_have_count(3);expect(page.locator('[data-update-total]')).to_have_text('3')
  if height>500:
   page.evaluate("window.scrollTo({top:0,behavior:'instant'})");page.wait_for_timeout(250);page.screenshot(path=str(artifacts/f'updates-page-{width}.png'),full_page=True)
  page.get_by_role('button',name='Volver a la funa').click();expect(mine.locator('[data-update-count]')).to_have_text('3')
  page.go_back();expect(page.locator('#updates-feed>.update-card')).to_have_count(3);page.go_forward();expect(mine).to_be_visible()
  mine.get_by_role('button',name='Compartir',exact=True).click();page.get_by_role('button',name='Copiar enlace').click();expect(page.locator('.share-status')).to_contain_text('Enlace copiado');page.locator('#modal-root [data-action=close]').click()
  page.locator('.back-link').click();expect(other).to_be_visible();centered(page,'[data-open-updates=qa-inline-other] .media-carousel','.report-card')
  for index in [0,1]:
   other.locator('.carousel-slide').nth(index).click();page.wait_for_function('document.querySelector(".viewer-stage>img")?.naturalWidth>0');page.wait_for_timeout(250);centered(page,'.gallery-viewer');centered(page,'.viewer-stage>img','.viewer-stage');assert page.locator('.viewer-stage>img').evaluate('(img)=>getComputedStyle(img).objectPosition')=='50% 50%';page.locator('.viewer-header [data-action=close]').click()
  other.get_by_role('button',name='Ver actualizaciones de esta funa').click();expect(page.locator('#update-form')).to_have_count(0);expect(page.locator('#updates-feed>.update-card')).to_have_count(1);expect(page.locator('#updates-feed')).not_to_contain_text('Novedad exclusiva para qa-inline-mine')
  page.reload();expect(page.locator('#updates-feed>.update-card')).to_have_count(1)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  assert not errors,errors
  print('PASS vista de novedades',width,height,': solo contador, tocar funa, página propia, tarjetas, fotos, lector, historial y marco multimedia centrado')
  page.close()
 browser.close()
