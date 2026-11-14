import './style.css';

const storeKey = 'funados-todos-dashboard-v1';
const initial = { categories: ['General', 'Conducta', 'Comunidad'], cases: [], activity: ['Panel creado y listo para gestionar contenido.'], settings: { moderation: true, confirm: true } };
const state = JSON.parse(localStorage.getItem(storeKey) || 'null') || structuredClone(initial);
const $ = (selector) => document.querySelector(selector);
const save = () => localStorage.setItem(storeKey, JSON.stringify(state));
const log = (message) => { state.activity.unshift(message); state.activity = state.activity.slice(0, 5); save(); };

function render() {
  $('#case-count').textContent = state.cases.filter(c => c.status === 'published').length;
  $('#review-count').textContent = state.cases.filter(c => c.status === 'review').length;
  $('#category-count').textContent = state.categories.length;
  $('#moderation-toggle').checked = state.settings.moderation;
  $('#confirm-toggle').checked = state.settings.confirm;
  $('#category-list').innerHTML = state.categories.map((name, i) => `<div class="category-chip"><span><b>${escape(name)}</b><small>${state.cases.filter(c => c.category === name).length} casos</small></span><button data-remove-category="${i}" aria-label="Eliminar ${escape(name)}">×</button></div>`).join('');
  $('#case-category').innerHTML = state.categories.map(n => `<option>${escape(n)}</option>`).join('');
  const body = $('#cases-body');
  body.innerHTML = state.cases.map(c => `<tr><td><input class="case-check" type="checkbox" data-id="${c.id}" aria-label="Seleccionar ${escape(c.title)}" /></td><td><b>${escape(c.title)}</b><br><small>${c.date}</small></td><td>${escape(c.category)}</td><td><span class="badge ${c.status}">${c.status === 'published' ? 'Publicado' : 'En revisión'}</span></td><td><button class="row-button" data-action="toggle" data-id="${c.id}">${c.status === 'published' ? 'Ocultar' : 'Publicar'}</button><button class="row-button danger" data-action="delete" data-id="${c.id}">Eliminar</button></td></tr>`).join('');
  $('#cases-empty').hidden = state.cases.length > 0;
  $('#activity-list').innerHTML = state.activity.map((a, i) => `<li><span>${i === 0 ? '●' : '○'}</span>${escape(a)}</li>`).join('');
}
const escape = (text) => String(text).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

async function countVisit() {
  // A unique local count works out of the box; replace this with Firestore Analytics in production.
  const visits = Number(localStorage.getItem('funados-todos-visits') || 0) + 1;
  localStorage.setItem('funados-todos-visits', visits);
  $('#visit-count').textContent = new Intl.NumberFormat('es-EC').format(visits);
  $('#visit-note').textContent = 'Contador local de esta instalación';
}

$('#new-case').onclick = () => { if (!state.categories.length) return alert('Crea una categoría antes de añadir un caso.'); $('#case-dialog').showModal(); };
$('#case-form').addEventListener('submit', event => { event.preventDefault(); const title = $('#case-title').value.trim(); if (!title) return; const selectedStatus = $('#case-status').value; const status = state.settings.moderation ? 'review' : selectedStatus; state.cases.unshift({ id: crypto.randomUUID(), title, category: $('#case-category').value, status, date: new Intl.DateTimeFormat('es-EC', { day:'2-digit', month:'short', year:'numeric' }).format(new Date()) }); log(`Se creó “${title}”${status === 'review' ? ' y quedó en revisión.' : '.'}`); $('#case-form').reset(); $('#case-dialog').close(); render(); });
$('#cases-body').onclick = event => { const button = event.target.closest('[data-action]'); if (!button) return; const item = state.cases.find(c => c.id === button.dataset.id); if (!item) return; if (button.dataset.action === 'delete') { if (!state.settings.confirm || confirm(`¿Eliminar “${item.title}”? Esta acción no se puede deshacer.`)) { state.cases = state.cases.filter(c => c.id !== item.id); log(`Se eliminó “${item.title}”.`); save(); render(); } } else { item.status = item.status === 'published' ? 'review' : 'published'; log(`“${item.title}” fue ${item.status === 'published' ? 'publicado' : 'enviado a revisión'}.`); save(); render(); } };
$('#clear-cases').onclick = () => { const ids = [...document.querySelectorAll('.case-check:checked')].map(x => x.dataset.id); if (!ids.length) return alert('Selecciona al menos un caso.'); if (!state.settings.confirm || confirm(`¿Eliminar ${ids.length} caso(s) seleccionado(s)?`)) { state.cases = state.cases.filter(c => !ids.includes(c.id)); log(`Se eliminaron ${ids.length} caso(s).`); save(); render(); } };
$('#select-all').onchange = event => document.querySelectorAll('.case-check').forEach(box => box.checked = event.target.checked);
$('#new-category').onclick = () => { const name = prompt('Nombre de la categoría:')?.trim(); if (!name || state.categories.includes(name)) return; state.categories.push(name); log(`Se añadió la categoría “${name}”.`); save(); render(); };
$('#category-list').onclick = event => { const index = event.target.dataset.removeCategory; if (index === undefined) return; const name = state.categories[index]; if (state.cases.some(c => c.category === name)) return alert('No puedes eliminar una categoría que todavía tiene casos.'); if (confirm(`¿Eliminar la categoría “${name}”?`)) { state.categories.splice(index, 1); log(`Se eliminó la categoría “${name}”.`); save(); render(); } };
$('#moderation-toggle').onchange = e => { state.settings.moderation = e.target.checked; log(`Moderación previa ${e.target.checked ? 'activada' : 'desactivada'}.`); save(); };
$('#confirm-toggle').onchange = e => { state.settings.confirm = e.target.checked; save(); };
document.querySelectorAll('.nav-link').forEach(link => link.onclick = () => { document.querySelector('.nav-link.active').classList.remove('active'); link.classList.add('active'); });
render(); countVisit();

