"""Diseño de seis reacciones, total de novedades y contador dentro de la burbuja."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
report={'id':'qa-six-design','canton':'machala','title':'Publicación de prueba para las seis reacciones','description':'Contenido ficticio para verificar las reacciones y el diseño de los comentarios.','status':'approved','category':'Funa','authorUid':'qa-six-user','authorAlias':'Anónimo','createdAt':1700000000000,'images':[],'media':[]}
updates=[{'id':'qa-six-update','reportId':report['id'],'text':'Novedad de prueba para verificar la ubicación del total.','authorUid':'qa-six-user','createdAt':1700000000010}]
kinds=['like','wow','concern','angry','sad','love'];artifacts=Path(os.environ.get('QA_ARTIFACT_DIR','/tmp/funados-qa'));artifacts.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [320,390,768,1440]:
  page=browser.new_page(viewport={'width':width,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda route:route.abort());page.route('**/config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.FUNADOS_FIREBASE_CONFIG={};'))
  page.add_init_script('localStorage.setItem("funados_todos_reports_v3",'+json.dumps(json.dumps([report]))+');localStorage.setItem("funados_todos_updates_v6",'+json.dumps(json.dumps(updates))+');sessionStorage.setItem("funados_todos_guest_v3","qa-six-user");')
  page.goto('http://127.0.0.1:5000/#/canton/machala');expect(page.locator('.react-button')).to_have_count(6)
  expect(page.locator('.react-label')).to_have_count(0)
  expect(page.locator('.react-button[data-kind=love] .react-emoji')).to_have_text('🤢')
  for button in page.locator('.react-button').all():
   emoji=button.locator('.react-emoji').bounding_box();count=button.locator('.react-number').bounding_box();assert count['x']>=emoji['x']+emoji['width'];assert abs(count['y']+count['height']/2-emoji['y']-emoji['height']/2)<2
  for kind in kinds:
   button=page.locator('.react-button[data-kind='+kind+']');button.click();expect(button).to_have_attribute('aria-pressed','true');expect(button.locator('.react-number')).to_have_text('1');assert page.locator('.react-button[aria-pressed=true]').count()==1
  page.locator('.react-button[data-kind=love]').click();assert page.locator('.react-button[aria-pressed=true]').count()==0
  page.get_by_role('button',name='Comentarios',exact=True).click();page.locator('#reply-text').fill('Comentario de prueba para verificar el número dentro de la burbuja.');page.get_by_role('button',name='Publicar comentario').click();expect(page.locator('[data-comment-count]')).to_have_text('1');expect(page.locator('.comment-react-button')).to_have_count(6)
  for kind in kinds:
   button=page.locator('.comment-react-button[data-kind='+kind+']');button.click();expect(button).to_have_attribute('aria-pressed','true');expect(button.locator('.react-number')).to_have_text('1');assert page.locator('.comment-react-button[aria-pressed=true]').count()==1
  geometry=page.locator('.comment-bubble').evaluate('''bubble=>{const b=bubble.getBoundingClientRect(),n=bubble.querySelector('[data-comment-count]').getBoundingClientRect();return n.x>=b.x&&n.right<=b.right&&n.y>=b.y&&n.bottom<=b.bottom}''');assert geometry
  for selector in ['.react-button','.comment-react-button']:
   for button in page.locator(selector).all():
    b=button.bounding_box();assert b['x']>=-1 and b['x']+b['width']<=width+1,(width,selector,b)
  page.evaluate("window.scrollTo({top:0,behavior:'instant'})");page.screenshot(path=str(artifacts/f'six-reactions-{width}.png'),full_page=True)
  page.get_by_role('button',name='Ver actualizaciones de esta funa').click();expect(page.locator('.updates-back-row')).to_be_visible();expect(page.locator('.section-head .updates-page-count')).to_have_count(0)
  back=page.get_by_role('button',name='Volver a la funa').bounding_box();total=page.locator('.updates-back-row .updates-page-count').bounding_box();assert total['x']>=back['x']+back['width'];assert abs(total['y']+total['height']/2-back['y']-back['height']/2)<2
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  assert not errors,errors
  print('PASS seis reacciones',width,'px: publicar/comentar, selección única, burbuja con contador y novedades junto a volver')
  page.close()
 browser.close()
