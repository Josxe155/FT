"""Prueba local B15. No sustituye los emuladores de seguridad de Firebase."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
assets=root/'assets'
scripts=(assets/'cantons.js').read_text().replace('export const','const')+'\n'+(assets/'firebase-client.js').read_text().replace('export const','const').replace('export async function','async function').replace('export function','function')+'\n'+'\n'.join((assets/'main.js').read_text().splitlines()[2:])
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in (320,390,768,1440):
        page=browser.new_page(viewport={'width':width,'height':850})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://**/*', lambda route:route.abort())
        page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toasts"></div></body></html>')
        page.add_script_tag(content="""for(const key of ['localStorage','sessionStorage']){const map={};Object.defineProperty(window,key,{configurable:true,value:{getItem:k=>Object.hasOwn(map,k)?map[k]:null,setItem:(k,v)=>map[k]=String(v),removeItem:k=>delete map[k]}})};if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(36).slice(2).padEnd(10,'x');""")
        page.add_style_tag(content=(assets/'styles.css').read_text())
        page.add_script_tag(content='window.FUNADOS_FIREBASE_CONFIG={};\n'+scripts)
        page.get_by_role('button',name='Modo de invitado').click()
        page.locator('#guest-alias').fill('Prueba V15')
        page.get_by_role('button',name='Continuar',exact=True).click()
        assert page.locator('.canton-card').count()==14
        page.get_by_role('button',name='Abrir funas de Marcabelí').click()
        page.get_by_role('button',name='Añadir funa').first.click()
        page.locator('#post-title').fill('Reporte de prueba del sistema')
        page.locator('#post-description').fill('Descripción de prueba sobre un servicio de la comunidad sin mencionar a ninguna persona.')
        page.get_by_role('button',name='Publicar',exact=True).click()
        assert page.locator('.report-card').count()==1
        # Botones dentro del viewport (móvil estrecho y zoom).
        for b in page.locator('.report-bottom button').all():
            box=b.bounding_box()
            assert box and box['x']>=-1 and box['x']+box['width']<=width+2,(width,box)
        page.locator('[data-action=flag]').first.click()
        assert page.locator('#flag-extra-wrap').is_hidden()
        page.locator('#flag-reason').select_option('Otro')
        assert page.locator('#flag-extra-wrap').is_visible()
        page.locator('#flag-details').fill('El motivo específico de prueba es que el contenido tiene información equivocada.')
        page.get_by_role('button',name='Enviar reporte').click()
        assert page.locator('#flag-form').count()==0
        # No crear un segundo reporte por la misma cuenta en modo local.
        page.locator('[data-action=flag]').first.click()
        page.locator('#flag-reason').select_option('Otro')
        page.locator('#flag-details').fill('Segunda denuncia duplicada, que el sistema debe rechazar.')
        page.get_by_role('button',name='Enviar reporte').click()
        assert page.locator('#flag-form').count()==1
        page.locator('#modal-root [data-action=close]').click()
        # Comentarios integrados y sin duplicados tras reaccionar y ordenar.
        page.locator('[data-action=thread]').first.click()
        page.locator('#reply-text').fill('Un comentario anónimo para revisar la duplicación.')
        page.get_by_role('button',name='Publicar comentario').click()
        assert page.locator('.reply-item').count()==1
        page.locator('.react-button[data-kind=wow]').click()
        assert page.locator('.reply-item').count()==1
        # Tras 30 reportes el servidor cambiaría el estado a pending.
        page.evaluate("state.reports[0].status='pending';render()")
        assert 'Publicación reportada muchas veces' in page.locator('.report-card').inner_text()
        assert 'Reporte de prueba del sistema' not in page.locator('.report-card').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),f'desbordamiento {width}'
        assert not errors,(width,errors)
        print('PASS V15',width,'px: 14 cantones, publicación, compartir sin recorte, Otro, no duplicar reporte, comentario, revisión, responsive')
        page.close()
    browser.close()
