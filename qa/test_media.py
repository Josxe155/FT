"""Prueba de la web compilada: servidor local en 5000, sin Firebase real."""
import base64,json,io,subprocess,tempfile,os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
def png(color):
 out=io.BytesIO();Image.new('RGB',(480,300),color).save(out,format='PNG');return out.getvalue()
red,blue=png('#d78096'),png('#355a9b')
with tempfile.TemporaryDirectory() as temp:
 fixture=Path(temp)/'fixture.webm'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x355a9b:s=320x180:r=15','-t','8','-c:v','libvpx-vp9','-an','-y',str(fixture)],check=True)
 video=fixture.read_bytes()
artifacts=Path(os.environ.get('QA_ARTIFACT_DIR','/tmp/funados-qa'));artifacts.mkdir(parents=True,exist_ok=True)
def data(mime,value):return 'data:'+mime+';base64,'+base64.b64encode(value).decode()
report={'id':'qa-media-report','canton':'machala','title':'Publicación técnica de prueba multimedia','description':'Contenido ficticio de prueba, sin datos personales, para comprobar las galerías y los controles.','category':'Funa','status':'approved','authorUid':'qa-media-user','authorAlias':'Anónimo','createdAt':1700000000000,'images':[],'media':[{'id':str(i),'ownerUid':'qa-media-user','name':name,'type':mime,'size':len(raw),'chunks':1,'localUrl':data(mime,raw)} for i,(name,mime,raw) in enumerate([('video.exe','video/webm',video),('foto-roja.png','image/png',red),('foto-azul.png','image/png',blue)])]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
 for width in [320,390,1440]:
  page=browser.new_page(viewport={'width':width,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda route:route.abort())
  page.route('**/config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.FUNADOS_FIREBASE_CONFIG={};'))
  page.add_init_script('localStorage.setItem("funados_todos_reports_v3",'+json.dumps(json.dumps([report]))+');sessionStorage.setItem("funados_todos_guest_v3","qa-media-user");')
  page.goto('http://127.0.0.1:5000/#/canton/machala');post=page.locator('.report-card').first;expect(post).to_be_visible()
  expect(post.locator('.carousel-slide')).to_have_count(3)
  post.locator('[data-carousel-dir="1"]').click();expect(post.locator('[data-carousel-count]')).to_have_text('2 / 3')
  post.locator('.carousel-slide').nth(1).click();expect(page.locator('.gallery-viewer')).to_be_visible();expect(page.locator('.viewer-header>span')).to_have_text('2 / 3')
  page.locator('[data-action="viewer-next"]').click();expect(page.locator('.viewer-header>span')).to_have_text('3 / 3')
  page.keyboard.press('ArrowLeft');expect(page.locator('.viewer-header>span')).to_have_text('2 / 3')
  page.locator('[data-action="viewer-prev"]').click();expect(page.locator('.video-player')).to_be_visible()
  page.wait_for_function('document.querySelector(".video-player video").duration>0')
  for selector in ['[data-video-play]','[data-video-mute]','[data-video-fullscreen]']:
   centered=page.locator(selector).evaluate('(button)=>{const b=button.getBoundingClientRect(),s=button.querySelector("svg").getBoundingClientRect();return Math.abs(b.x+b.width/2-s.x-s.width/2)<1 && Math.abs(b.y+b.height/2-s.y-s.height/2)<1}')
   assert centered,selector

  expect(page.locator('a[download]')).to_have_count(0)
  expect(page.locator('.video-player video')).to_have_attribute('controlsList','nodownload')
  page.locator('[data-video-play]').click();page.wait_for_function('!document.querySelector(".video-player video").paused')
  page.locator('[data-video-play]').click();page.wait_for_function('document.querySelector(".video-player video").paused')
  page.locator('[data-video-seek]').evaluate('(e)=>{e.value="2";e.dispatchEvent(new Event("input",{bubbles:true}));}')
  page.wait_for_function('document.querySelector(".video-player video").currentTime>=1.8')
  page.locator('[data-video-volume]').evaluate('(e)=>{e.value="0.3";e.dispatchEvent(new Event("input",{bubbles:true}));}')
  assert abs(page.locator('video').evaluate('(v)=>v.volume')-.3)<.01
  page.locator('[data-video-speed]').select_option('2');assert page.locator('video').evaluate('(v)=>v.playbackRate')==2
  page.locator('[data-video-mute]').click();assert page.locator('video').evaluate('(v)=>v.muted')
  page.locator('[data-video-fullscreen]').click();page.wait_for_function('!!document.fullscreenElement')
  page.locator('[data-video-fullscreen]').click();page.wait_for_function('!document.fullscreenElement')
  page.locator('video').evaluate('(v)=>window.__qaVideo=v');page.locator('.viewer-header [data-action=close]').click();expect(page.locator('.gallery-viewer')).to_have_count(0);assert page.evaluate('window.__qaVideo.paused')
  page.get_by_role('button',name='Ver actualizaciones de esta funa',exact=True).click();page.locator('#update-text').fill('Actualización ficticia con dos fotografías de prueba.')
  page.locator('#update-images').set_input_files([{'name':'foto-roja.png','mimeType':'image/png','buffer':red},{'name':'foto-azul.png','mimeType':'image/png','buffer':blue}])
  page.get_by_role('button',name='Publicar actualización').click();expect(page.locator('.update-message')).to_have_count(1);expect(page.locator('.update-message .carousel-slide')).to_have_count(2)
  expect(page.locator('#update-text')).to_have_value('')
  page.locator('#update-text').fill('Este borrador debe conservarse al ampliar una fotografía.')
  page.locator('.update-message .carousel-slide').first.click();expect(page.locator('.gallery-viewer')).to_be_visible()
  page.locator('.viewer-header [data-action=close]').click();expect(page.locator('.updates-page')).to_be_visible();expect(page.locator('#update-text')).to_have_value('Este borrador debe conservarse al ampliar una fotografía.')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  page.wait_for_timeout(250)
  page.screenshot(path=str(artifacts/f'media-{width}.png'))
  assert not errors,errors
  print('PASS multimedia',width,'px: carrusel, visor, vídeo, controles, fotos de actualización y borradores')
  page.close()
 browser.close()
