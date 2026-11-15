"""Revisión de secciones con la web compilada, sin servicios ni datos reales."""
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1440]:
  page=browser.new_page(viewport={'width':width,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda route:route.abort())
  page.route('**/config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.FUNADOS_FIREBASE_CONFIG={};'))
  page.goto('http://127.0.0.1:5000/');expect(page.get_by_role('heading',name='Inicio de sesión')).to_be_visible()
  expect(page.get_by_role('button',name='Continuar con Google')).to_be_enabled()
  page.get_by_role('button',name='Modo de invitado').click();page.locator('#guest-alias').fill('Revisión de rutas');page.get_by_role('button',name='Continuar',exact=True).click()
  expect(page.locator('.canton-card')).to_have_count(14)
  cantons=page.locator('.canton-card').evaluate_all('(cards)=>cards.map(c=>({page:c.dataset.page,name:c.querySelector(".canton-detail strong").textContent}))')
  page.locator('#search').fill('Machala');expect(page.locator('.canton-card:visible')).to_have_count(1);page.locator('#search').fill('')
  for canton in cantons:
   page.locator('.canton-card[data-page="'+canton['page']+'"]').click()
   expect(page.locator('h1')).to_have_text(canton['name'])
   expect(page.get_by_role('button',name='Añadir funa').first).to_be_visible()
   page.locator('.back-link').click()
  def nav(section):
   if width<800:
    page.locator('.hamburger').click();page.locator('.side-panel [data-page="'+section+'"]').click()
   else:page.locator('.desktop-nav [data-page="'+section+'"]').click()
  nav('ajustes');expect(page.locator('h1')).to_have_text('Ajustes')
  page.locator('#alias-edit').fill('Apodo revisado');page.locator('#alias-form button').click();expect(page.locator('.identity-row strong')).to_have_text('Apodo revisado')
  page.locator('#pref-compact').check(force=True);assert page.evaluate('document.documentElement.classList.contains("compact-layout")')
  page.locator('#pref-animations').uncheck(force=True);assert page.evaluate('document.documentElement.classList.contains("reduce-animations")')
  page.get_by_role('button',name='Ver mis funas').click();expect(page.locator('h1')).to_have_text('Mis funas');page.locator('.back-link').click()
  nav('tiktok');expect(page.locator('h1')).to_have_text('TikTok');page.get_by_role('button',name='Añadir cuenta').click();page.locator('#tt-username').fill('qa_rutas');page.locator('#tiktok-form button[type=submit]').click()
  expect(page.locator('.tiktok-card')).to_have_count(1);assert page.locator('.tiktok-card').get_attribute('href')=='https://www.tiktok.com/@qa_rutas'
  nav('ajustes');page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Eliminar mi cuenta de TikTok').click();expect(page.get_by_role('button',name='Añadir mi TikTok')).to_be_visible()
  page.get_by_role('button',name='Cerrar sesión',exact=True).click();expect(page.get_by_role('heading',name='Inicio de sesión')).to_be_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  assert not errors,errors
  print('PASS rutas',width,'px: acceso, inicio, búsqueda, 14 cantones, ajustes, apodo, preferencias, mis funas, TikTok y salida')
  page.close()
 browser.close()
