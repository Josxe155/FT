from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];assets=root/'assets'
code=(assets/'cantons.js').read_text().replace('export const','const')+'\n'+(assets/'firebase-client.js').read_text().replace('export const','const').replace('export async function','async function').replace('export function','function')+'\n'+'\n'.join((assets/'main.js').read_text().splitlines()[2:])
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [390,1440]:
  page=b.new_page(viewport={'width':width,'height':800})
  page.route('https://**/*',lambda r:r.abort())
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<!doctype html><html><body><div id="app"></div><div id="modal-root"></div><div id="toasts"></div></body></html>')
  page.add_script_tag(content="""for(const key of ['localStorage','sessionStorage']){const map={};Object.defineProperty(window,key,{configurable:true,value:{getItem:k=>Object.hasOwn(map,k)?map[k]:null,setItem:(k,v)=>map[k]=String(v),removeItem:k=>delete map[k]}})};if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(36).slice(2).padEnd(10,'x');""")
  page.add_style_tag(content=(assets/'styles.css').read_text())
  page.add_script_tag(content='window.FUNADOS_FIREBASE_CONFIG={};\n'+code)
  page.get_by_role('button',name='Modo de invitado').click();page.locator('#guest-alias').fill('Pruebas');page.get_by_role('button',name='Continuar',exact=True).click()
  if width==390:
   hamburger=page.locator('.hamburger');assert hamburger.is_visible();assert hamburger.bounding_box()['x']>width/2
   hamburger.click();assert page.locator('.side-panel').count()==1
   page.keyboard.press('Escape');assert page.locator('.side-panel').count()==0
   hamburger.click();page.evaluate('history.back()');page.wait_for_timeout(120);assert page.locator('.side-panel').count()==0
  nav='.desktop-nav [data-page="tiktok"]' if width>800 else '.hamburger'
  if width>800:page.locator(nav).click()
  else:page.locator(nav).click();page.locator('.side-panel [data-page="tiktok"]').click()
  page.get_by_role('button',name='Añadir cuenta').click()
  page.locator('#tt-username').fill('demo_cantonal')
  page.get_by_role('button',name='Añadir cuenta',exact=False).last.click()
  assert page.locator('.tiktok-card').count()==1
  if width>800:page.locator('.desktop-nav [data-page="ajustes"]').click()
  else:page.locator('.hamburger').click();page.locator('.side-panel [data-page="ajustes"]').click()
  page.locator('#pref-animations').uncheck(force=True)
  assert page.evaluate('document.documentElement.classList.contains("reduce-animations")')
  page.locator('.signout-button').click();assert page.locator('h1').first.inner_text()=='Inicio de sesión'
  assert not errors,errors
  print('EXTRA PASS',width,'mobile back/Escape, TikTok, preferences, sign-out')
  page.close()
 b.close()
