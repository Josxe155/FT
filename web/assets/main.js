import { videoPlayerMarkup, safeMediaFilename } from './media-ui.js';
import { cantons, cantonMap } from './cantons.js';
import { firebaseEnabled, initFirebase, loginGoogle, loginGuest, logoutFirebase, saveAlias, listenReports, loadMoreReports, hasMoreReports, getCantonTotals, listenReplies, addReport, realtimeMediaAvailable, loadEvidenceURL, clearEvidenceCache, flagReport, saveTikTok, deleteTikTok, listenTikTok, trackVisit, trackActivity, listenReactionSummary, setReaction, addNestedReply, editReplyText, deleteOwnReply, listenFunaUpdates, addFunaUpdate, listenCommentReactionSummary, setCommentReaction, fetchReportById, countMyReports } from './firebase-client.js';
const app = document.getElementById('app');
const modal = document.getElementById('modal-root');
const toasts = document.getElementById('toasts');
const KEY = { session: 'funados_todos_guest_v3', reports: 'funados_todos_reports_v3', replies: 'funados_todos_replies_v3', tiktok: 'funados_todos_tiktok_v3', alias: 'funados_todos_alias_v4', prefs: 'funados_todos_prefs_v4', reactions: 'funados_todos_reactions_v5', commentReactions: 'funados_todos_comment_reactions_v6', updates: 'funados_todos_updates_v6' };
const reactionKinds = [['like', '👍', 'Me gusta'], ['wow', '😮', 'Sorprende'], ['concern', '😟', 'Preocupa']];
const zeroCounts = () => ({ like: 0, wow: 0, concern: 0 });
const state = {
    cantonTotals: {}, previewMediaType: 'image/jpeg', commentReactions: {}, myCommentReactions: {}, updatesPost: null, currentUpdates: [], replyTarget: null, editReplyId: null, reactions: {}, myReactions: {}, user: null, busy: false, menu: false, dialogue: null, canton: 'machala', thread: null, flagId: null, flagReplyId: null, imageFiles: [], reports: read(KEY.reports, []), replies: read(KEY.replies, []), remoteReports: [], remoteReplies: [], profiles: [], profileName: read(KEY.tiktok, ''), search: '', online: null, sort: 'recientes', prefs: read(KEY.prefs, { animations: true, compact: false }), previewImage: ''
};
let previewItems = [], previewIndex = 0, previewLoad = 0, previewLoading = false;
let updateFiles = [], updateDraftText = '';
let viewerReturnUpdates = false;
let stopReports = () => { }, stopReplies = () => { }, stopTikTok = () => { }, stopPresence = () => { }, stopActivity = () => { }, stopUpdates = () => { };
// La decisión de ver una funa sensible dura solo hasta salir de la sesión.
const revealedSensitivePosts = new Set();
let commentObserver = null;
let stopCommentReactions = [];
const pendingCommentReactions = new Set();
let stopReactionListeners = [];
let reactionObserver = null;
let reactionPending = new Set();
function localVotes() { return read(KEY.reactions, {}); }
function localReactionCounts(reportId) { const votes = Object.values(localVotes()[reportId] || {}); return votes.reduce((acc, v) => { if (v !== 'none')
    acc[v]++; return acc; }, zeroCounts()); }
function localMyReaction(reportId) { return localVotes()[reportId]?.[state.user?.uid || ''] || 'none'; }
function currentReactionCounts(id) { return firebaseEnabled ? (state.reactions[id] || zeroCounts()) : localReactionCounts(id); }
function currentMyReaction(id) { return firebaseEnabled ? (state.myReactions[id] || 'none') : localMyReaction(id); }
function syncReactionUI(id) {
    const counts = currentReactionCounts(id), mine = currentMyReaction(id);
    for (const button of document.querySelectorAll('button[data-action=react]')) {
        if (button.dataset.id !== id)
            continue;
        const kind = button.dataset.kind;
        const count = button.querySelector('.react-number');
        if (count)
            count.textContent = String(counts[kind] || 0);
        button.classList.toggle('react-selected', kind === mine);
        button.setAttribute('aria-pressed', String(kind === mine));
        button.disabled = reactionPending.has(id);
    }
}
function watchVisibleReactions() {
    reactionObserver?.disconnect();
    reactionObserver = null;
    stopReactionListeners.forEach(stop => stop());
    stopReactionListeners = [];
    if (!firebaseEnabled || !state.user)
        return;
    const bars = [...document.querySelectorAll('.reactions-bar[data-id]')];
    const subscribed = new Map();
    const listen = (id) => {
        if (subscribed.has(id))
            return;
        subscribed.set(id, listenReactionSummary(id, state.user.uid, (counts, mine) => {
            if (reactionPending.has(id))
                return;
            state.reactions[id] = counts;
            state.myReactions[id] = mine;
            syncReactionUI(id);
        }));
    };
    if (typeof IntersectionObserver === 'undefined') {
        for (const id of new Set(bars.map(bar => bar.dataset.id || '').filter(Boolean)))
            listen(id);
    }
    else {
        reactionObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const id = entry.target.dataset.id || '';
                if (!id)
                    continue;
                if (entry.isIntersecting)
                    listen(id);
                else if (subscribed.has(id)) {
                    subscribed.get(id)();
                    subscribed.delete(id);
                }
            }
        }, { rootMargin: '300px' });
        bars.forEach(bar => reactionObserver.observe(bar));
    }
    stopReactionListeners = [() => { for (const stop of subscribed.values())
            stop(); subscribed.clear(); }];
}
async function reactToReport(reportId, kind) {
    if (!state.user || reactionPending.has(reportId) || !allReports().some(r => r.id === reportId && r.status === 'approved'))
        return;
    const oldMine = currentMyReaction(reportId), next = oldMine === kind ? 'none' : kind;
    const before = { ...currentReactionCounts(reportId) };
    reactionPending.add(reportId);
    if (firebaseEnabled) {
        const optimistic = { ...before };
        if (oldMine !== 'none')
            optimistic[oldMine] = Math.max(0, optimistic[oldMine] - 1);
        if (next !== 'none')
            optimistic[next]++;
        state.reactions[reportId] = optimistic;
        state.myReactions[reportId] = next;
    }
    syncReactionUI(reportId);
    try {
        if (firebaseEnabled)
            await setReaction(reportId, next);
        else {
            const votes = localVotes();
            votes[reportId] ??= {};
            votes[reportId][state.user.uid] = next;
            save(KEY.reactions, votes);
        }
    }
    catch (err) {
        if (firebaseEnabled) {
            state.reactions[reportId] = before;
            state.myReactions[reportId] = oldMine;
        }
        toast(err?.message || 'No se pudo registrar la reacción.', 'bad');
    }
    finally {
        reactionPending.delete(reportId);
        syncReactionUI(reportId);
    }
}
// El almacenamiento local usa un identificador por funa/comentario para evitar colisiones.
const reactionKey = (postId, commentId) => postId + '::' + commentId;
function localCommentVotes() { return read(KEY.commentReactions, {}); }
function commentCounts(postId, id) {
    const key = reactionKey(postId, id);
    if (firebaseEnabled)
        return state.commentReactions[key] || zeroCounts();
    return Object.values(localCommentVotes()[key] || {}).reduce((a, v) => { if (v !== 'none')
        a[v]++; return a; }, zeroCounts());
}
function myCommentVote(postId, id) {
    const key = reactionKey(postId, id);
    return firebaseEnabled ? (state.myCommentReactions[key] || 'none') : (localCommentVotes()[key]?.[state.user?.uid || ''] || 'none');
}
function syncCommentReactionUI(postId, id) {
    const key = reactionKey(postId, id), counts = commentCounts(postId, id), mine = myCommentVote(postId, id);
    app.querySelectorAll('button[data-action=react-comment]').forEach(b => {
        if (b.dataset.id !== id || b.dataset.parent !== postId)
            return;
        const kind = b.dataset.kind;
        const num = b.querySelector('.react-number');
        if (num)
            num.textContent = String(counts[kind] || 0);
        b.classList.toggle('react-selected', kind === mine);
        b.setAttribute('aria-pressed', String(kind === mine));
        b.disabled = pendingCommentReactions.has(key);
    });
}
function stopCommentReactionWatch() {
    commentObserver?.disconnect();
    commentObserver = null;
    stopCommentReactions.forEach(fn => fn());
    stopCommentReactions = [];
}
function watchVisibleCommentReactions() {
    stopCommentReactionWatch();
    if (!firebaseEnabled || !state.user || !state.thread)
        return;
    const bars = [...app.querySelectorAll('.comment-reactions[data-comment-id]')];
    const subs = new Map();
    const uid = state.user.uid, postId = state.thread;
    const watch = (id) => {
        if (subs.has(id))
            return;
        subs.set(id, listenCommentReactionSummary(postId, id, uid, (counts, mine) => {
            const key = reactionKey(postId, id);
            if (pendingCommentReactions.has(key))
                return;
            state.commentReactions[key] = counts;
            state.myCommentReactions[key] = mine;
            syncCommentReactionUI(postId, id);
        }));
    };
    if (typeof IntersectionObserver === 'undefined')
        bars.forEach(b => watch(b.dataset.commentId || ''));
    else {
        commentObserver = new IntersectionObserver(entries => entries.forEach(entry => {
            const id = entry.target.dataset.commentId || '';
            if (!id)
                return;
            if (entry.isIntersecting)
                watch(id);
            else if (subs.has(id)) {
                subs.get(id)();
                subs.delete(id);
            }
        }), { rootMargin: '180px' });
        bars.forEach(el => commentObserver.observe(el));
    }
    stopCommentReactions = [() => { subs.forEach(fn => fn()); subs.clear(); }];
}
async function reactToComment(postId, commentId, kind) {
    const key = reactionKey(postId, commentId);
    if (!state.user || pendingCommentReactions.has(key) || !allReplies().some(x => x.id === commentId && x.reportId === postId && x.status === 'approved'))
        return;
    const oldMine = myCommentVote(postId, commentId), next = oldMine === kind ? 'none' : kind;
    const before = { ...commentCounts(postId, commentId) };
    pendingCommentReactions.add(key);
    if (firebaseEnabled) {
        const optimistic = { ...before };
        if (oldMine !== 'none')
            optimistic[oldMine] = Math.max(0, optimistic[oldMine] - 1);
        if (next !== 'none')
            optimistic[next]++;
        state.commentReactions[key] = optimistic;
        state.myCommentReactions[key] = next;
    }
    syncCommentReactionUI(postId, commentId);
    try {
        if (firebaseEnabled)
            await setCommentReaction(postId, commentId, next);
        else {
            const all = localCommentVotes();
            all[key] ??= {};
            all[key][state.user.uid] = next;
            save(KEY.commentReactions, all);
        }
    }
    catch (e) {
        if (firebaseEnabled) {
            state.commentReactions[key] = before;
            state.myCommentReactions[key] = oldMine;
        }
        toast(e?.message || 'No se pudo registrar la reacción.', 'bad');
    }
    finally {
        pendingCommentReactions.delete(key);
        syncCommentReactionUI(postId, commentId);
    }
}
function localUpdates() { return read(KEY.updates, []); }
function allUpdatesFor(reportId) { return (firebaseEnabled ? state.currentUpdates : localUpdates()).filter(u => u.reportId === reportId).sort((a, b) => a.createdAt - b.createdAt); }
function read(key, fallback) { try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
}
catch {
    return fallback;
} }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
const ico = (path, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons = { arrow: ico('<path d="M4 12h15m-6-6 6 6-6 6"/>'), out: ico('<path d="M14 4h6v6m0-6L10 14"/><path d="M20 13v6H5V4h6"/>'), plus: ico('<path d="M12 4v16M4 12h16"/>'), back: ico('<path d="m15 18-6-6 6-6"/>'), close: ico('<path d="M18 6 6 18M6 6l12 12"/>'), menu: ico('<path d="M4 7h16M4 12h16M4 17h16"/>'), pin: ico('<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'), image: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 6-6 5 5 3-3 4 4"/>'), reply: ico('<path d="M21 11a8 8 0 0 1-8 8c-1.5 0-2.4-.2-3.4-.6L4 20l1.8-4.4A8 8 0 1 1 21 11Z"/>'), flag: ico('<path d="M4 22V3m0 1q5-3 9 0t8 0v12q-5 3-9 0t-8 0"/>'), search: ico('<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>'), user: ico('<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>'), settings: ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.3l-2 2-2.2-.7a2 2 0 0 0-1.7.9L13.5 22h-3l-.4-2.5a2 2 0 0 0-1.7-.9l-2.2.7-2-2A2 2 0 0 0 4.6 15L2 13.5v-3L4.6 9a2 2 0 0 0-.4-2.3l2-2 2.2.7a2 2 0 0 0 1.7-.9L10.5 2h3l.4 2.5a2 2 0 0 0 1.7.9l2.2-.7 2 2A2 2 0 0 0 19.4 9l2.6 1.5v3z"/>'), logout: ico('<path d="M10 17l5-5-5-5M15 12H3M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>'), clock: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), share: ico('<path d="M18 8a3 3 0 1 0-2.8-4M6 14a3 3 0 1 0-2.8-4M18 22a3 3 0 1 0-2.8-4M8 12l8-5M8 14l8 5"/>'), list: ico('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), eyeOff: ico('<path d="M3 3 21 21"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.8 5.2A10 10 0 0 1 12 5c5.5 0 9.5 7 9.5 7a15 15 0 0 1-3 3.5"/><path d="M6.5 6.5C3.9 8.6 2.5 12 2.5 12S6.5 19 12 19c1.3 0 2.6-.3 3.7-.8"/>') };
const googleIcon = `<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.23 5.48-4.72 7.18l7.73 6C44.46 38.03 46.98 31.86 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59a14.41 14.41 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
const allReports = () => firebaseEnabled ? state.remoteReports : state.reports;
const postLookups = new Set();
const finishedPostLookups = new Set();
let myReportCountRemote = null;
const allReplies = () => firebaseEnabled ? state.remoteReplies : state.replies;
const count = (slug) => state.cantonTotals[slug] ?? allReports().filter(p => p.canton === slug && p.status === 'approved').length;
const countR = (reportId) => allReplies().filter(r => r.reportId === reportId && r.status === 'approved').length;
const formatDate = (time) => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time));
const formatDateTime = (time) => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(time));
const segs = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
function toast(message, kind = 'ok') { let d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = message; d.setAttribute('role', 'status'); toasts.append(d); setTimeout(() => d.remove(), 3900); }
let routeRenderPending = false;
let lastRenderedHash = '';
function requestRouteRender() { if (routeRenderPending)
    return; routeRenderPending = true; requestAnimationFrame(() => { routeRenderPending = false; render(); }); }
function navigate(page) {
    if (history.state?.funadosOverlay)
        history.replaceState(null, '', location.href);
    stopReplies();
    stopUpdates();
    stopCommentReactionWatch();
    state.menu = false;
    state.thread = null;
    state.updatesPost = null;
    state.replyTarget = null;
    state.editReplyId = null;
    state.dialogue = null;
    state.search = '';
    location.hash = '#/' + page;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function photo(c, extra = '') { return `<img class="${extra}" src="${esc(c.image)}" alt="Fotografía de ${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity='0'">`; }
function brand(small = false) { return `<span class="brand-mark"><img src="./assets/logo.svg?v=20261115b" alt="" width="${small ? 38 : 46}" height="${small ? 38 : 46}"><strong>Funados <span>Todos</span></strong></span>`; }
function avatar(user, large = false) { const cls = large ? 'profile-avatar large' : 'profile-avatar'; return user?.photoURL && !user.isAnonymous ? `<img class="${cls}" src="${esc(user.photoURL)}" alt="Foto de perfil" referrerpolicy="no-referrer">` : `<span class="${cls} guest-avatar">${icons.user}</span>`; }
function rankedCantons() { return [...cantons].sort((a, b) => count(b.slug) - count(a.slug) || rank(a.slug) - rank(b.slug)); }
function rank(slug) { return slug === 'marcabeli' ? 0 : slug === 'balsas' ? 1 : 2 + cantons.findIndex(c => c.slug === slug); }
function applyPrefs() { document.documentElement.classList.toggle('reduce-animations', !state.prefs.animations); document.documentElement.classList.toggle('compact-layout', state.prefs.compact); }
function loginView() { return `<div class="login-page"><div class="ambient ambient-blue"></div><div class="ambient ambient-red"></div><main class="auth-center"><div class="auth-emblem"><div class="auth-logo-halo"></div><img src="./assets/logo.svg?v=20261115b" alt="Logotipo de Funados Todos"></div><h1>Inicio de sesión</h1><div class="auth-actions"><button class="auth-button auth-google" type="button" data-action="google" ${state.busy ? 'disabled' : ''}>${googleIcon}<span>Continuar con Google</span>${icons.arrow}</button><button class="auth-button auth-guest" type="button" data-action="guest" ${state.busy ? 'disabled' : ''}>${icons.user}<span>Modo de invitado</span>${icons.arrow}</button></div><div class="auth-note"><strong>Nota:</strong><p>El inicio de sesión solo se utiliza para una sesión activa, esto no se mostrará a ningún usuario ya que todo es anónimo.</p></div></main></div>`; }
function tiktokAuthor(r) {
    const profile = state.profiles.find((p) => p.uid === r.authorUid);
    const username = String(profile?.tiktokUsername || '');
    if (!/^[a-zA-Z0-9._]{2,24}$/.test(username))
        return `<span class="report-author"><span class="mini-avatar">${icons.user}</span> Anónimo</span>`;
    const url = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
    const img = `https://unavatar.io/tiktok/${encodeURIComponent(username)}`;
    return `<a class="report-author tiktok-author" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Perfil de TikTok declarado por el autor"><span class="mini-avatar"><img src="${esc(img)}" alt="" loading="lazy" onerror="this.style.display='none'"></span>@${esc(username)} ${icons.out}</a>`;
}
let evidenceObserver = null;
function mediaById(postId, id, updateId) {
    const post = allReports().find(x => x.id === postId);
    if (!post)
        return null;
    const source = updateId ? allUpdatesFor(postId).find(u => u.id === updateId)?.media : post.media;
    return (Array.isArray(source) ? source : []).find(x => x && x.id === id && x.ownerUid === post.authorUid && typeof x.type === 'string') || null;
}
function hydrateEvidence() {
    evidenceObserver?.disconnect();
    evidenceObserver = null;
    const nodes = [...document.querySelectorAll('img[data-evidence-preview]')];
    const hydrate = async (el) => {
        if (el.dataset.loaded)
            return;
        el.dataset.loaded = '1';
        const post = el.dataset.report || '', item = mediaById(post, el.dataset.file || '', el.dataset.update);
        if (!item)
            return;
        try {
            el.src = await loadEvidenceURL(post, item, el.dataset.update);
        }
        catch {
            el.alt = 'Imagen no disponible';
            el.classList.add('evidence-missing');
        }
    };
    if (typeof IntersectionObserver === 'undefined')
        nodes.forEach(el => { void hydrate(el); });
    else {
        evidenceObserver = new IntersectionObserver(entries => entries.forEach(en => {
            if (en.isIntersecting) {
                const el = en.target;
                evidenceObserver?.unobserve(el);
                void hydrate(el);
            }
        }), { rootMargin: '180px' });
        nodes.forEach(el => evidenceObserver.observe(el));
    }
}
function galleryItems(r, updateId) {
    const source = updateId ? allUpdatesFor(r.id).find(u => u.id === updateId)?.media : r.media;
    const media = (Array.isArray(source) ? source : []).filter(m => m && typeof m.id === 'string' && /^(?:[0-9]|[A-Za-z0-9_-]{8,80})$/.test(m.id) && m.ownerUid === r.authorUid && typeof m.type === 'string' && /^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/.test(m.type));
    const items = media.map(m => ({ media: m, type: m.type, name: String(m.name || 'Evidencia'), reportId: r.id, updateId }));
    if (!updateId)
        for (const url of (Array.isArray(r.images) ? r.images : []).filter(u => typeof u === 'string' && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(u)).slice(0, 10))
            items.push({ url, type: 'image/jpeg', name: 'Imagen adjunta', reportId: r.id });
    return items;
}
function evidenceMarkup(r, updateId) {
    const items = galleryItems(r, updateId);
    if (!items.length)
        return '';
    const key = updateId ? r.id + '-' + updateId : r.id;
    return `<div class="report-images media-carousel ${items.length === 1 ? 'single' : ''}" data-carousel="${esc(key)}" role="region" aria-label="Evidencias adjuntas" tabindex="0"><div class="carousel-track">${items.map((item, i) => `<button class="image-open evidence-open carousel-slide" type="button" data-action="gallery-open" data-post="${esc(r.id)}" data-update="${esc(updateId || '')}" data-index="${i}" aria-label="Abrir evidencia ${i + 1}: ${esc(item.name)}">${item.type.startsWith('video/') ? '<span class="evidence-video-icon">▶</span><small>Reproducir vídeo</small>' : item.media ? `<img data-evidence-preview data-report="${esc(r.id)}" data-file="${esc(item.media.id)}" ${updateId ? `data-update="${esc(updateId)}"` : ''} alt="${esc(item.name)}" loading="lazy">` : `<img src="${esc(item.url)}" alt="Imagen adjunta" loading="lazy">`}</button>`).join('')}</div>${items.length > 1 ? `<div class="carousel-tools"><button type="button" data-carousel-dir="-1" aria-label="Evidencia anterior">‹</button><span data-carousel-count>1 / ${items.length}</span><button type="button" data-carousel-dir="1" aria-label="Evidencia siguiente">›</button></div><div class="carousel-dots">${items.map((_, i) => `<button type="button" data-carousel-index="${i}" aria-label="Ir a evidencia ${i + 1}" aria-current="${i === 0}"></button>`).join('')}</div>` : ''}</div>`;
}
async function previewAt(index) {
    if (index < 0 || index >= previewItems.length)
        return;
    previewIndex = index;
    const item = previewItems[index], request = ++previewLoad;
    state.dialogue = 'image';
    previewLoading = true;
    state.previewImage = '';
    state.previewMediaType = item.type;
    renderModal();
    try {
        const url = item.media ? await loadEvidenceURL(item.reportId, item.media, item.updateId) : item.url;
        if (request !== previewLoad || state.dialogue !== 'image')
            return;
        state.previewImage = url;
        previewLoading = false;
        renderModal();
    }
    catch (error) {
        if (request === previewLoad) {
            previewLoading = false;
            close();
            toast(error?.message || 'No se pudo abrir la evidencia.', 'bad');
        }
    }
}
function pushOverlayHistory() { if (!history.state?.funadosOverlay)
    history.pushState({ funadosOverlay: true }, '', location.href); }
function header(active) {
    const item = (page, label) => `<button class="nav-item ${active === page ? 'selected' : ''}" data-action="nav" data-page="${page}">${label}</button>`;
    const itemMobile = (page, label, ic) => `<button class="side-link ${active === page ? 'active' : ''}" data-action="nav" data-page="${page}">${ic}<span>${label}</span>${icons.arrow}</button>`;
    return `<header class="topbar"><div class="topbar-inner"><button class="brand-control" data-action="nav" data-page="inicio" aria-label="Ir al inicio">${brand()}</button><nav class="desktop-nav" aria-label="Menú principal">${item('inicio', 'Inicio')}${item('tiktok', 'TikTok')}${item('ajustes', 'Ajustes')}</nav><button class="hamburger" type="button" aria-label="${state.menu ? 'Cerrar menú' : 'Abrir menú'}" aria-expanded="${state.menu ? 'true' : 'false'}" data-action="toggle-menu">${state.menu ? icons.close : icons.menu}</button></div></header>${state.menu ? `<div class="side-dimmer" data-action="close-menu"></div><aside class="side-panel" aria-label="Menú lateral"><div class="side-head">${brand(true)}<button class="side-close" data-action="close-menu" aria-label="Cerrar menú">${icons.close}</button></div><div class="side-profile">${avatar(state.user)}<span><strong>${esc(state.user?.alias || 'Invitado')}</strong><small>${state.user?.isAnonymous ? 'Modo invitado' : 'Cuenta de Google'}</small></span></div><nav class="side-links">${itemMobile('inicio', 'Inicio', icons.back)}${itemMobile('tiktok', 'TikTok', icons.out)}${itemMobile('mis-funas', 'Mis funas', icons.list)}${itemMobile('ajustes', 'Ajustes', icons.settings)}</nav></aside>` : ''}`;
}
function footer() { return `<footer class="site-footer">© Funados Todos — 2026</footer>`; }
function cantonCard(c) { return `<button type="button" class="canton-card" data-action="nav" data-page="canton/${c.slug}" aria-label="Abrir funas de ${esc(c.name)}"><span class="canton-photo">${photo(c)}<span class="photo-shade"></span><span class="canton-number">${count(c.slug)} ${count(c.slug) === 1 ? 'funa' : 'funas'}</span></span><span class="canton-detail"><strong>${esc(c.name)}</strong><span class="canton-arrow">${icons.arrow}</span></span></button>`; }
function homeView() { return `<main class="main-area home-area"><div class="section-head"><div><span class="section-line"></span><h1>Cantones</h1></div><div class="search-box">${icons.search}<input id="search" type="search" placeholder="Buscar cantón" value="${esc(state.search)}" aria-label="Buscar cantón"></div></div><section class="cantons-grid" id="cantons-grid" aria-label="Todos los cantones">${rankedCantons().map(cantonCard).join('')}</section></main>`; }
function emptyView() { return `<div class="empty-state"><span class="empty-line"></span><h2>Aún no hay funas en este cantón</h2><button class="button-primary" type="button" data-action="compose">${icons.plus} Añadir funa</button></div>`; }
function sensitiveGate(id) {
    return `<section class="sensitive-gate" aria-label="Aviso de contenido sensible"><div class="sensitive-blur" aria-hidden="true"></div><div class="sensitive-gate-body"><span class="sensitive-eye" aria-hidden="true">${icons.eyeOff}</span><h2>Contenido sensible</h2><p>Esta funa puede incluir imágenes, vídeos o información que algunas personas prefieran no ver.</p><button class="sensitive-reveal" type="button" data-action="reveal-sensitive" data-id="${esc(id)}">Ver contenido</button></div></section>`;
}
function reportCard(r) {
    if (r.status === 'deleting')
        return '<article class="report-card"><h2>Publicación caducada</h2><p>Se está eliminando junto con sus evidencias.</p></article>';
    if (r.status === 'pending')
        return `<article class="report-card report-under-review"><div class="report-top"><span class="report-author">${icons.flag} Funa en revisión</span><time>${formatDate(r.createdAt)}</time></div><div class="review-notice"><h2>Publicación reportada muchas veces</h2><p>Esta funa recibió numerosos reportes y está oculta mientras se revisa. No se muestran sus evidencias ni información.</p></div></article>`;
    if (r.sensitiveContent === true && !revealedSensitivePosts.has(r.id)) {
        return `<article class="report-card"><div class="report-top">${tiktokAuthor(r)}<time>${formatDate(r.createdAt)}</time></div>${sensitiveGate(r.id)}<div class="sensitive-actions"><button type="button" class="text-action" data-action="share" data-id="${esc(r.id)}">${icons.share} Compartir</button><button type="button" class="text-action subtle-action" data-action="flag" data-id="${esc(r.id)}">${icons.flag} Reportar</button></div></article>`;
    }
    const badge = r.sensitiveContent === true ? `<div class="sensitive-showing"><span>${icons.eyeOff} Contenido sensible</span><button type="button" data-action="hide-sensitive" data-id="${esc(r.id)}">Ocultar contenido</button></div>` : '';
    return `<article class="report-card"><div class="report-top">${tiktokAuthor(r)}<time>${formatDate(r.createdAt)}</time></div>${badge}<h2>${esc(r.title)}</h2><p class="report-copy">${esc(r.description)}</p>${evidenceMarkup(r)}<div class="reactions-bar" data-id="${esc(r.id)}" aria-label="Reacciones a la publicación">${reactionKinds.map(([kind, emoji, label]) => `<button class="react-button ${currentMyReaction(r.id) === kind ? 'react-selected' : ''}" type="button" data-action="react" data-id="${esc(r.id)}" data-kind="${kind}" aria-label="${label}" aria-pressed="${currentMyReaction(r.id) === kind}"><span class="react-emoji" aria-hidden="true">${emoji}</span><span class="react-label">${label}</span><span class="react-number">${currentReactionCounts(r.id)[kind]}</span></button>`).join('')}</div><div class="report-bottom"><button class="text-action" type="button" data-action="updates" data-id="${esc(r.id)}">${icons.clock} Actualizaciones</button><button class="text-action" type="button" data-action="thread" data-id="${esc(r.id)}" aria-expanded="${state.thread === r.id}" aria-controls="comments-${esc(r.id)}">${icons.reply} Comentarios${firebaseEnabled ? '' : ` · ${countR(r.id)}`}</button><button class="text-action" type="button" data-action="share" data-id="${esc(r.id)}">${icons.share} Compartir</button><button class="text-action subtle-action" type="button" data-action="flag" data-id="${esc(r.id)}" aria-label="Reportar esta publicación">${icons.flag} Reportar</button></div>${state.thread === r.id ? threadInline(r.id) : ''}</article>`;
}
function cantonView(slug) { const c = cantonMap[slug]; if (!c)
    return homeView(); state.canton = slug; const posts = allReports().filter(r => r.canton === slug && ['approved', 'pending'].includes(r.status)).sort((a, b) => state.sort === 'antiguas' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt); return `<main class="main-area detail-area"><button type="button" class="back-link" data-action="nav" data-page="inicio">${icons.back} Todos los cantones</button><div class="canton-banner">${photo(c)}<div class="banner-overlay"></div><div class="banner-content"><span>CANTÓN</span><h1>${esc(c.name)}</h1><div class="banner-meta">${count(slug)} ${count(slug) === 1 ? 'funa publicada' : 'funas publicadas'}</div></div></div><div class="feed-toolbar"><h2>Funas</h2><div class="feed-actions"><label class="sort-control">Ordenar <select id="sort-posts" aria-label="Orden de las funas"><option value="recientes" ${state.sort === 'recientes' ? 'selected' : ''}>Recientes</option><option value="antiguas" ${state.sort === 'antiguas' ? 'selected' : ''}>Antiguas</option></select></label><button class="button-primary" type="button" data-action="compose">${icons.plus} Añadir funa</button></div></div><section class="feed" aria-label="Funas del cantón">${posts.length ? posts.map(reportCard).join('') : emptyView()}</section>${firebaseEnabled && hasMoreReports() ? '<div class="load-more-row"><button type="button" class="button-primary" data-action="load-more">Cargar más funas ${icons.arrow}</button></div>' : ''}</main>`; }
function tiktokView() { const data = firebaseEnabled ? state.profiles : (state.profileName ? [{ tiktokUsername: state.profileName }] : []); return `<main class="main-area tiktok-page"><div class="section-head"><div><span class="section-line"></span><h1>TikTok</h1></div><button class="button-primary" type="button" data-action="tiktok-add">${icons.plus} Añadir cuenta</button></div><section class="tiktok-grid">${data.length ? data.map((p) => { const u = String(p.tiktokUsername || ''); if (!/^[a-zA-Z0-9._]{2,24}$/.test(u))
    return ''; const target = `https://www.tiktok.com/@${encodeURIComponent(u)}`; const img = `https://unavatar.io/tiktok/${encodeURIComponent(u)}`; return `<a class="tiktok-card tt-v4" href="${esc(target)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir perfil de TikTok @${esc(u)}"><div class="tiktok-picture"><span class="tiktok-fallback">${icons.user}</span><img src="${esc(img)}" alt="Foto de perfil de TikTok de @${esc(u)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'"></div><div class="tiktok-name"><strong>@${esc(u)}</strong><small>Ver en TikTok</small></div><div class="tiktok-arrow">${icons.out}</div></a>`; }).join('') : `<div class="empty-state tiktok-empty"><h2>No hay cuentas añadidas</h2></div>`}</section></main>`; }
function ownReports() { return allReports().filter(r => r.authorUid === state.user?.uid && r.status === 'approved').sort((a, b) => b.createdAt - a.createdAt); }
function settingsView() { const u = state.user; const mine = ownReports(); const totalMine = firebaseEnabled ? (myReportCountRemote ?? mine.length) : mine.length; const mineTikTok = firebaseEnabled ? state.profiles.find((p) => p.uid === u?.uid)?.tiktokUsername : state.profileName; const tikTokPanel = mineTikTok ? `<section class="settings-panel"><h2>Mi TikTok</h2><p class="settings-help">Tu cuenta vinculada: <strong>@${esc(mineTikTok)}</strong></p><button type="button" class="signout-button" data-action="delete-tiktok">Eliminar mi cuenta de TikTok</button></section>` : `<section class="settings-panel"><h2>Mi TikTok</h2><p class="settings-help">Puedes vincular una cuenta voluntariamente. Solo tú podrás eliminarla.</p><button type="button" class="settings-link" data-action="tiktok-add">${icons.plus} Añadir mi TikTok ${icons.arrow}</button></section>`; return `<main class="main-area settings-page"><div class="section-head"><div><span class="section-line"></span><h1>Ajustes</h1></div></div><div class="settings-grid"><section class="settings-panel"><h2>Mi perfil</h2><div class="identity-row">${avatar(u, true)}<div><strong>${esc(u?.alias || 'Invitado')}</strong><small>${u?.isAnonymous ? 'Modo invitado' : 'Cuenta de Google'}</small></div></div>${u?.isAnonymous ? `<form id="alias-form" class="alias-inline"><label for="alias-edit">Apodo de invitado</label><div><input id="alias-edit" name="alias" minlength="2" maxlength="24" value="${esc(u.alias)}" required><button class="small-save" type="submit">Guardar</button></div></form>` : ''}<div class="settings-stat"><span>Mis funas publicadas</span><strong>${totalMine}</strong></div><button class="settings-link" data-action="nav" data-page="mis-funas">${icons.list} Ver mis funas ${icons.arrow}</button></section>${tikTokPanel}<section class="settings-panel"><h2>Preferencias</h2><label class="setting-toggle"><span><b>Animaciones</b><small>Transiciones y efectos visuales</small></span><input type="checkbox" id="pref-animations" ${state.prefs.animations ? 'checked' : ''}><span class="toggle-ui"></span></label><label class="setting-toggle"><span><b>Vista compacta</b><small>Reduce los espacios entre tarjetas</small></span><input type="checkbox" id="pref-compact" ${state.prefs.compact ? 'checked' : ''}><span class="toggle-ui"></span></label><div class="settings-separator"></div><button type="button" class="signout-button" data-action="logout">${icons.logout} Cerrar sesión</button></section></div></main>`; }
function ownView() { return `<main class="main-area detail-area"><button class="back-link" data-action="nav" data-page="ajustes">${icons.back} Ajustes</button><div class="section-head"><div><span class="section-line"></span><h1>Mis funas</h1></div></div><div class="count-note">${ownReports().length} ${ownReports().length === 1 ? 'publicación' : 'publicaciones'}</div><section class="feed">${ownReports().length ? ownReports().map(r => `<div class="own-entry"><button class="own-canton" data-action="nav" data-page="canton/${esc(r.canton)}">${esc(cantonMap[r.canton]?.name || r.canton)} ${icons.arrow}</button>${reportCard(r)}</div>`).join('') : `<div class="empty-state"><h2>Todavía no has publicado funas.</h2></div>`}</section></main>`; }
function singleView(id) {
    const r = allReports().find(r => r.id === id && ['approved', 'pending'].includes(r.status));
    if (!r && firebaseEnabled && !postLookups.has(id)) {
        postLookups.add(id);
        void fetchReportById(id).then(result => {
            if (result && !state.remoteReports.some(p => p.id === result.id))
                state.remoteReports.push(result);
            finishedPostLookups.add(id);
            if (segs()[0] === 'funa' && segs()[1] === id)
                render();
        }).catch(err => { finishedPostLookups.add(id); console.warn('No se encontró la publicación:', err); if (segs()[1] === id) {
            toast('No se pudo cargar la funa. Comprueba los permisos.', 'bad');
            render();
        } });
    }
    if (!r)
        return `<main class="main-area detail-area"><button class="back-link" data-action="nav" data-page="inicio">${icons.back} Inicio</button><div class="empty-state"><h2>${!firebaseEnabled || finishedPostLookups.has(id) ? 'Publicación no disponible' : 'Buscando publicación...'}</h2><p>Si el enlace es correcto, la publicación puede haber sido retirada.</p></div></main>`;
    return `<main class="main-area detail-area"><button class="back-link" data-action="nav" data-page="canton/${esc(r.canton)}">${icons.back} ${esc(cantonMap[r.canton]?.name || 'Cantón')}</button><div class="feed">${reportCard(r)}</div></main>`;
}
function commentReactionBar(r) { const totals = commentCounts(r.reportId, r.id), own = myCommentVote(r.reportId, r.id); return `<div class="comment-reactions" data-comment-id="${esc(r.id)}" aria-label="Reacciones al comentario">${reactionKinds.map(([kind, emoji, label]) => `<button type="button" class="comment-react-button ${own === kind ? 'react-selected' : ''}" data-action="react-comment" data-parent="${esc(r.reportId)}" data-id="${esc(r.id)}" data-kind="${kind}" aria-label="${label}" aria-pressed="${own === kind}"><span aria-hidden="true">${emoji}</span> <span class="react-number">${totals[kind]}</span></button>`).join('')}</div>`; }
function replyCard(r) {
    const mine = state.user?.uid === r.authorUid;
    return `<div class="reply-item" data-comment="${esc(r.id)}"><div class="reply-heading"><span class="report-author"><span class="mini-avatar">${icons.user}</span>Anónimo</span><time>${formatDateTime(r.createdAt)}</time></div>${state.editReplyId === r.id ? `<form id="edit-reply-form" data-id="${esc(r.id)}" class="edit-comment-form"><label for="edit-reply-text">Editar comentario</label><textarea id="edit-reply-text" name="text" minlength="8" maxlength="700" rows="3" required>${esc(r.text)}</textarea><div class="comment-actions"><button class="small-save" type="submit">Guardar</button><button class="comment-link" type="button" data-action="cancel-edit">Cancelar</button></div></form>` : `<p>${esc(r.text)}</p>${r.editedAt ? '<small class="edited-label">Editado</small>' : ''}`} ${commentReactionBar(r)}<div class="comment-actions"><button class="comment-link" type="button" data-action="reply-to" data-id="${esc(r.id)}">Responder</button>${mine ? `<button class="comment-link" type="button" data-action="edit-comment" data-id="${esc(r.id)}">Editar</button><button class="comment-link danger" type="button" data-action="delete-comment" data-id="${esc(r.id)}">Eliminar</button>` : ''}<button class="comment-link muted" type="button" data-action="flag-reply" data-id="${esc(r.id)}" data-parent="${esc(r.reportId)}">${icons.flag} Reportar</button></div></div>`;
}
function commentTree(comments) {
    const present = new Set(comments.map(r => r.id));
    const grouped = new Map();
    for (const r of comments) {
        const key = r.parentId && present.has(r.parentId) && r.parentId !== r.id ? r.parentId : '';
        grouped.set(key, [...(grouped.get(key) || []), r]);
    }
    const seen = new Set();
    const walk = (r, depth) => {
        if (seen.has(r.id))
            return '';
        seen.add(r.id);
        const children = grouped.get(r.id) || [];
        return `<div class="comment-node ${depth ? 'comment-child' : ''}">${replyCard(r)}${children.length ? `<div class="comment-children">${children.map(x => walk(x, depth + 1)).join('')}</div>` : ''}</div>`;
    };
    const roots = grouped.get('') || [];
    return roots.map(r => walk(r, 0)).join('') + comments.filter(r => !seen.has(r.id)).map(r => walk(r, 0)).join('');
}
function threadInline(reportId) {
    const r = allReports().find(p => p.id === reportId);
    if (!r)
        return '';
    const comments = allReplies().filter(x => x.reportId === reportId && x.status === 'approved').sort((a, b) => a.createdAt - b.createdAt);
    const target = comments.find(x => x.id === state.replyTarget);
    return `<section class="inline-comments" id="comments-${esc(reportId)}" aria-label="Comentarios de la funa" tabindex="-1"><div class="inline-comment-title"><h3>Comentarios</h3><button type="button" data-action="thread" data-id="${esc(reportId)}" class="comment-link">Cerrar ${icons.close}</button></div><div class="reply-list">${comments.length ? commentTree(comments) : '<p class="no-replies">Todavía no hay comentarios.</p>'}</div><form id="reply-form" class="reply-form">${target ? `<div class="replying-to"><span>Respondiendo a un comentario anónimo</span><button type="button" class="comment-link" data-action="cancel-reply">Cancelar</button></div>` : ''}<label for="reply-text">${target ? 'Responder de forma anónima' : 'Comentar de forma anónima'}</label><textarea id="reply-text" name="reply" rows="3" minlength="8" maxlength="700" required placeholder="${target ? 'Escribe tu respuesta...' : 'Escribe tu comentario...'}"></textarea><button class="button-primary" type="submit">${target ? 'Publicar respuesta' : 'Publicar comentario'} ${icons.arrow}</button></form></section>`;
}
function renderInlineThread() {
    if (!state.thread)
        return;
    const reportId = state.thread;
    const old = document.getElementById('comments-' + reportId);
    if (!old) {
        render();
        return;
    }
    const text = old.querySelector('#reply-text')?.value || '';
    const edit = old.querySelector('#edit-reply-text')?.value;
    const activeId = document.activeElement?.id;
    const currentEdit = old.querySelector('#edit-reply-form')?.getAttribute('data-id');
    const holder = document.createElement('div');
    holder.innerHTML = threadInline(reportId);
    const next = holder.firstElementChild;
    if (!next)
        return;
    old.replaceWith(next);
    const draft = document.getElementById('reply-text');
    if (draft) {
        draft.value = text;
        if (activeId === 'reply-text')
            draft.focus();
    }
    const editField = document.getElementById('edit-reply-text');
    if (editField && currentEdit === state.editReplyId && edit !== undefined) {
        editField.value = edit;
        if (activeId === 'edit-reply-text')
            editField.focus();
    }
    watchVisibleCommentReactions();
}
function toggleInlineThread(reportId) {
    const next = state.thread === reportId ? null : reportId;
    stopReplies();
    stopCommentReactionWatch();
    state.remoteReplies = [];
    state.thread = next;
    state.replyTarget = null;
    state.editReplyId = null;
    if (next && firebaseEnabled && state.user) {
        stopReplies = listenReplies(next, state.user.uid, replies => { if (state.thread !== next)
            return; state.remoteReplies = replies; renderInlineThread(); }, (error) => toast('No se pudieron cargar los comentarios: ' + (error?.code || 'comprueba los permisos.'), 'bad'));
    }
    render();
    if (next)
        document.getElementById('comments-' + next)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function updatesDialog() {
    const r = allReports().find(r => r.id === state.updatesPost && r.status === 'approved');
    if (!r)
        return '';
    const mine = state.user?.uid === r.authorUid, items = allUpdatesFor(r.id);
    return `<div class="modal-overlay" data-action="close-overlay"><section class="modal-panel thread-panel updates-panel" role="dialog" aria-modal="true" aria-label="Actualizaciones de la funa"><div class="modal-header"><div><span class="updates-kicker">SEGUIMIENTO</span><h2>Actualizaciones</h2></div><button class="icon-control" type="button" aria-label="Cerrar" data-action="close">${icons.close}</button></div><div class="update-context"><strong>${esc(r.title)}</strong><p>Nueva información del autor, sin perder el contexto de la publicación.</p></div><div class="thread-content update-timeline">${items.length ? items.map(u => `<article class="update-item update-message"><span class="update-avatar">${icons.user}</span><div class="update-message-body"><div class="update-message-heading"><strong>Autor anónimo</strong><span class="update-badge">AUTOR</span><time>${formatDateTime(u.createdAt)}</time></div><p>${esc(u.text)}</p>${evidenceMarkup(r, u.id)}</div></article>`).join('') : '<p class="no-replies">Todavía no hay actualizaciones. Las novedades aparecerán aquí.</p>'}</div>${mine ? `<form id="update-form" class="reply-form update-composer"><label for="update-text">Añadir actualización</label><textarea id="update-text" name="update" rows="3" minlength="10" maxlength="1000" required placeholder="Comparte nueva información…"></textarea><div class="update-composer-bottom"><label class="update-attach" for="update-images">${icons.image} Adjuntar fotos<input id="update-images" type="file" accept="image/png,image/jpeg,image/webp" multiple class="visually-hidden"></label><small>Hasta 4 fotos · 5 MB cada una</small><button class="button-primary" type="submit">Publicar actualización ${icons.arrow}</button></div><p id="selected-update-images" class="selected-images">${esc(updateFiles.map(f => f.name).join(' · '))}</p></form>` : ''}</section></div>`;
}
function composerDialog() { return `<div class="modal-overlay" data-action="close-overlay"><section class="modal-panel" role="dialog" aria-modal="true" aria-label="Añadir una funa"><div class="modal-header"><h2>Añadir funa</h2><button class="icon-control" type="button" aria-label="Cerrar" data-action="close">${icons.close}</button></div><form id="compose-form" class="form-stack"><div class="field"><label for="post-title">Título</label><input id="post-title" name="title" type="text" maxlength="110" minlength="10" placeholder="Título de la funa" autocomplete="off" required></div><div class="field"><label for="post-description">Descripción</label><textarea id="post-description" name="description" rows="5" minlength="25" maxlength="1800" placeholder="Escribe la descripción de la funa..." required></textarea></div><div class="field"><label for="post-images">Evidencias <span class="muted">(opcional, hasta 10 imágenes o vídeos)</span></label><label class="upload-area" for="post-images">${icons.image}<span>Seleccionar evidencias</span><small>JPG, PNG, WebP, MP4, WebM o MOV · vídeos hasta 10 MB · imágenes hasta 5 MB</small></label><input class="visually-hidden" id="post-images" name="images" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple><div id="selected-images" class="selected-images"></div></div><label class="sensitive-compose" for="post-sensitive"><span class="sensitive-compose-icon">${icons.eyeOff}</span><span class="sensitive-compose-copy"><strong>Contenido sensible</strong><small>Ocultar título, descripción y evidencias hasta pulsar «Ver contenido». Opcional y desactivado por defecto.</small></span><input type="checkbox" name="sensitiveContent" id="post-sensitive" value="true"><span class="sensitive-compose-switch" aria-hidden="true"></span></label><button class="button-primary fullwidth" type="submit">Publicar</button></form></section></div>`; }
function guestDialog() { return `<div class="modal-overlay" data-action="close-overlay"><section class="modal-panel compact" role="dialog" aria-modal="true" aria-label="Apodo de invitado"><div class="modal-header"><h2>Modo de invitado</h2><button type="button" class="icon-control" data-action="close" aria-label="Cerrar">${icons.close}</button></div><form id="guest-form" class="form-stack"><div class="field"><label for="guest-alias">Elige un apodo</label><input id="guest-alias" name="alias" minlength="2" maxlength="24" placeholder="Tu apodo" autocomplete="nickname" value="${esc(read(KEY.alias, ''))}" required></div><button type="submit" class="button-primary fullwidth">Continuar</button></form></section></div>`; }
function imageDialog() {
    const movie = state.previewMediaType.startsWith('video/'), item = previewItems[previewIndex];
    const body = previewLoading ? '<div class="viewer-loading" role="status">Cargando evidencia…</div>' : movie ? videoPlayerMarkup(state.previewImage) : `<img src="${esc(state.previewImage)}" alt="${esc(item?.name || 'Evidencia ampliada')}">`;
    return `<div class="modal-overlay" data-action="close-overlay"><section class="photo-panel gallery-viewer" role="dialog" aria-modal="true" aria-label="Evidencia ampliada"><div class="viewer-header"><span>${previewItems.length ? `${previewIndex + 1} / ${previewItems.length}` : 'Evidencia'}</span><strong>${esc(item?.name || 'Archivo adjunto')}</strong><button class="icon-control" data-action="close" aria-label="Cerrar">${icons.close}</button></div>${body}<div class="viewer-footer">${previewItems.length > 1 ? `<button type="button" data-action="viewer-prev" ${previewIndex === 0 ? 'disabled' : ''} aria-label="Evidencia anterior">‹ Anterior</button><button type="button" data-action="viewer-next" ${previewIndex === previewItems.length - 1 ? 'disabled' : ''} aria-label="Evidencia siguiente">Siguiente ›</button>` : ''}${!previewLoading && /^(blob:|data:(image|video)\/)/.test(state.previewImage) ? `<a href="${esc(state.previewImage)}" download="${esc(safeMediaFilename(item?.name || 'evidencia', state.previewMediaType))}" target="_blank" rel="noopener noreferrer">Descargar original</a>` : ''}</div></section></div>`;
}
function tikTokDialog() { return `<div class="modal-overlay" data-action="close-overlay"><section class="modal-panel compact" role="dialog" aria-modal="true" aria-label="Añadir cuenta de TikTok"><div class="modal-header"><h2>Añadir TikTok</h2><button type="button" class="icon-control" data-action="close" aria-label="Cerrar">${icons.close}</button></div><form id="tiktok-form" class="form-stack"><div class="field"><label for="tt-username">Nombre de usuario</label><p class="identity-notice">Al vincular TikTok, tu @usuario aparecerá públicamente como autor de todas tus funas. Es un enlace declarado por ti; no es una verificación oficial.</p><div class="prefix-input"><span>@</span><input id="tt-username" name="username" placeholder="usuario" autocomplete="off" minlength="2" maxlength="24" required></div></div><button class="button-primary fullwidth" type="submit">Añadir cuenta ${icons.arrow}</button></form></section></div>`; }
function flagDialog() { return `<div class="modal-overlay" data-action="close-overlay"><section class="modal-panel compact" role="dialog" aria-modal="true" aria-label="Reportar publicación"><div class="modal-header"><h2>Reportar publicación</h2><button type="button" class="icon-control" data-action="close" aria-label="Cerrar">${icons.close}</button></div><form class="form-stack" id="flag-form"><div class="field"><label for="flag-reason">Motivo</label><select id="flag-reason" name="reason"><option>Acoso</option><option>Datos personales</option><option>Imágenes sin consentimiento</option><option>Otro</option></select></div><div class="field" id="flag-extra-wrap" hidden><label for="flag-details">Describe el motivo</label><textarea id="flag-details" name="details" minlength="10" maxlength="500" rows="4" placeholder="Explica por qué reportas esta funa..."></textarea></div><button class="button-primary fullwidth" type="submit">Enviar reporte</button></form></section></div>`; }
function renderModal() {
    const updateInput = modal.querySelector('#update-text');
    if (updateInput)
        updateDraftText = updateInput.value;
    const updateDraft = updateDraftText;
    const editDraft = modal.querySelector('#edit-reply-text')?.value;
    const activeId = document.activeElement?.id;
    const currentEdit = modal.querySelector('#edit-reply-form')?.getAttribute('data-id');
    const oldVideo = modal.querySelector('video');
    if (oldVideo) {
        oldVideo.pause();
        if (document.pictureInPictureElement === oldVideo)
            void document.exitPictureInPicture().catch(() => { });
    }
    modal.innerHTML = state.dialogue === 'compose' ? composerDialog() : state.dialogue === 'tiktok' ? tikTokDialog() : state.dialogue === 'flag' ? flagDialog() : state.dialogue === 'guest' ? guestDialog() : state.dialogue === 'image' ? imageDialog() : state.dialogue === 'updates' ? updatesDialog() : '';
    document.body.classList.toggle('modal-open', Boolean(state.dialogue));
    const refill = (id, value) => { const el = modal.querySelector('#' + id); if (el && value !== undefined) {
        el.value = value;
        if (activeId === id)
            el.focus();
    } };
    if (state.dialogue === 'updates' && updateDraft)
        refill('update-text', updateDraft);
    if (currentEdit === state.editReplyId && editDraft !== undefined)
        refill('edit-reply-text', editDraft);
    hydrateEvidence();
}
function render() { lastRenderedHash = location.hash; if (!state.user) {
    app.innerHTML = loginView();
    renderModal();
    return;
} const replyDraft = app.querySelector('#reply-text')?.value; const editDraft = app.querySelector('#edit-reply-text')?.value; const activeId = document.activeElement?.id; const route = segs(), p = route[0] || 'inicio'; app.innerHTML = header(p === 'canton' || p === 'funa' ? 'inicio' : p) + (p === 'canton' ? cantonView(route[1] || 'machala') : p === 'tiktok' ? tiktokView() : p === 'ajustes' ? settingsView() : p === 'mis-funas' ? ownView() : p === 'funa' ? singleView(route[1] || '') : homeView()) + footer(); applyPrefs(); renderModal(); if (replyDraft !== undefined) {
    const field = app.querySelector('#reply-text');
    if (field) {
        field.value = replyDraft;
        if (activeId === 'reply-text')
            field.focus();
    }
} if (editDraft !== undefined) {
    const field = app.querySelector('#edit-reply-text');
    if (field) {
        field.value = editDraft;
        if (activeId === 'edit-reply-text')
            field.focus();
    }
} watchVisibleReactions(); watchVisibleCommentReactions(); hydrateEvidence(); }
function setUser(user) { postLookups.clear(); finishedPostLookups.clear(); myReportCountRemote = null; revealedSensitivePosts.clear(); if (!user)
    clearEvidenceCache(); if (user?.isAnonymous)
    user = { ...user, alias: read(KEY.alias, user.alias || 'Invitado') }; state.user = user; state.remoteReports = []; state.remoteReplies = []; state.cantonTotals = {}; state.currentUpdates = []; state.commentReactions = {}; state.myCommentReactions = {}; state.updatesPost = null; state.replyTarget = null; state.editReplyId = null; stopUpdates(); stopCommentReactionWatch(); state.reactions = {}; state.myReactions = {}; reactionObserver?.disconnect(); reactionObserver = null; stopReactionListeners.forEach(stop => stop()); stopReactionListeners = []; stopReports(); stopReplies(); stopTikTok(); stopPresence(); stopActivity(); if (!user) {
    state.dialogue = null;
    state.menu = false;
    state.thread = null;
    state.imageFiles = [];
} if (user && firebaseEnabled) {
    stopActivity = trackActivity(user);
    void countMyReports(user.uid).then(n => { if (state.user?.uid === user.uid) {
        myReportCountRemote = n;
        if (segs()[0] === 'ajustes')
            render();
    } }).catch(() => { });
    stopReports = listenReports(reports => { state.remoteReports = reports; if (!state.dialogue && !document.querySelector('form:focus-within'))
        requestRouteRender(); }, user.uid, (error) => toast('Error al leer las funas desde Firebase: ' + (error?.code || 'comprueba los permisos.'), 'bad'));
    void getCantonTotals(cantons.map(c => c.slug)).then(t => { if (state.user?.uid === user?.uid) {
        state.cantonTotals = t;
        if (segs()[0] === 'inicio')
            render();
    } });
    stopTikTok = listenTikTok(profiles => { state.profiles = profiles; if (!state.dialogue && !state.thread && !state.menu)
        render(); });
} if (user && !location.hash)
    location.hash = '#/inicio'; render(); }
async function enterGuest(alias) { if (state.busy)
    return; const nickname = alias.trim(); if (nickname.length < 2 || nickname.length > 24) {
    toast('El apodo debe tener de 2 a 24 caracteres.', 'bad');
    return;
} state.busy = true; save(KEY.alias, nickname); try {
    if (firebaseEnabled) {
        const credential = await loginGuest();
        await saveAlias(credential.user.uid, nickname);
        if (state.user?.isAnonymous) {
            state.user.alias = nickname;
            render();
        }
    }
    else {
        let id = sessionStorage.getItem(KEY.session);
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem(KEY.session, id);
        }
        setUser({ uid: id, alias: nickname, isAnonymous: true });
    }
    close();
}
catch (e) {
    toast(e?.message || 'No se pudo iniciar sesión', 'bad');
}
finally {
    state.busy = false;
    render();
} }
async function logOut() { try {
    if (firebaseEnabled)
        await logoutFirebase();
    revealedSensitivePosts.clear();
    sessionStorage.removeItem(KEY.session);
    localStorage.removeItem(KEY.alias);
    state.menu = false;
    state.dialogue = null;
    state.thread = null;
    state.user = null;
    state.profiles = [];
    state.profileName = '';
    location.hash = '#/inicio';
    render();
    toast('Sesión cerrada.');
}
catch (e) {
    toast(e?.message || 'No se pudo cerrar sesión', 'bad');
} }
async function editAlias(form) { if (!state.user?.isAnonymous)
    return; const name = String(new FormData(form).get('alias') || '').trim(); if (name.length < 2 || name.length > 24) {
    toast('El apodo debe tener de 2 a 24 caracteres.', 'bad');
    return;
} try {
    if (firebaseEnabled)
        await saveAlias(state.user.uid, name);
    save(KEY.alias, name);
    state.user.alias = name;
    render();
    toast('Apodo actualizado.');
}
catch (e) {
    toast(e?.message || 'No se pudo guardar el apodo.', 'bad');
} }
async function enterGoogle() { if (!firebaseEnabled) {
    toast('La conexión con Google se activará al configurar Firebase.', 'bad');
    return;
} if (state.busy)
    return; state.busy = true; try {
    await loginGoogle();
}
catch (e) {
    toast(e?.message || 'No se pudo iniciar sesión con Google.', 'bad');
}
finally {
    state.busy = false;
    render();
} }
function close() { if (modal.querySelector('form[data-sending="1"]')) {
    toast('Espera a que termine la publicación.');
    return;
} if (state.dialogue === 'image' && viewerReturnUpdates && state.updatesPost) {
    viewerReturnUpdates = false;
    previewLoad++;
    previewLoading = false;
    state.dialogue = 'updates';
    renderModal();
    return;
} stopUpdates(); previewLoad++; previewLoading = false; updateFiles = []; updateDraftText = ''; state.dialogue = null; state.updatesPost = null; state.flagId = null; state.flagReplyId = null; state.imageFiles = []; renderModal(); }
function checkImages(files) {
    if (files.length > 10)
        return 'Puedes adjuntar hasta 10 evidencias en total.';
    const types = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (files.some(f => !types.includes(f.type)))
        return 'Formato no admitido. Usa JPG, PNG, WebP, MP4, WebM o MOV.';
    if (files.some(f => f.size <= 0))
        return 'No se permiten archivos vacíos.';
    if (files.some(f => f.type.startsWith('video/') && f.size > 10 * 1024 * 1024))
        return 'Cada vídeo debe pesar 10 MB o menos.';
    if (files.some(f => f.type.startsWith('image/') && f.size > 5 * 1024 * 1024))
        return 'Cada imagen debe pesar 5 MB o menos.';
    return '';
}
async function toPreview(f) { const image = await createImageBitmap(f); const scale = Math.min(1, 960 / Math.max(image.width, image.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(image.width * scale)); c.height = Math.max(1, Math.round(image.height * scale)); const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(image, 0, 0, c.width, c.height); image.close(); return c.toDataURL('image/jpeg', 0.7); }
function unsupportedContent(text) {
    // Barrera básica contra la exposición de contacto privado; no reemplaza protección del servidor.
    return /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text) || /(?:\+?593|0)[\s.-]?(?:\d[\s.-]?){9,10}/.test(text);
}
async function createFuna(form) {
    if (!state.user || form.dataset.sending === '1')
        return;
    if (firebaseEnabled && !navigator.onLine) {
        toast('Sin conexión. Reconéctate antes de publicar; tu texto sigue aquí.', 'bad');
        return;
    }
    const d = new FormData(form);
    const canton = state.canton;
    const title = String(d.get('title') || '').trim();
    const description = String(d.get('description') || '').trim();
    if (!cantonMap[canton] || title.length < 10 || title.length > 110 || description.length < 25 || description.length > 1800) {
        toast('Completa el título y la descripción.', 'bad');
        return;
    }
    const error = checkImages(state.imageFiles);
    if (error) {
        toast(error, 'bad');
        return;
    }
    if (unsupportedContent(title + ' ' + description)) {
        toast('No incluyas teléfonos ni correos personales.', 'bad');
        return;
    }
    const sensitiveContent = d.get('sensitiveContent') === 'true';
    const entry = { sensitiveContent, id: crypto.randomUUID(), canton, title, description, category: 'Funa', status: 'approved', authorUid: state.user.uid, authorAlias: 'Anónimo', createdAt: Date.now(), images: [] };
    const btn = form.querySelector('button[type=submit]');
    form.dataset.sending = '1';
    form.querySelectorAll('input,textarea,button').forEach(control => control.disabled = true);
    btn.textContent = 'Publicando...';
    let publishWarning = '';
    try {
        if (firebaseEnabled) {
            if (state.imageFiles.length && !realtimeMediaAvailable())
                throw new Error('Configura databaseURL de Realtime Database antes de publicar archivos.');
            const result = await addReport(entry, [...state.imageFiles]);
            publishWarning = result.warning || '';
        }
        else {
            entry.media = [];
            for (const file of state.imageFiles) {
                if (file.type.startsWith('video/'))
                    entry.media.push({ id: crypto.randomUUID(), ownerUid: state.user.uid, name: file.name, type: file.type, size: file.size, chunks: 1, localUrl: URL.createObjectURL(file) });
                else
                    entry.images.push(await toPreview(file));
            }
            state.reports.unshift(entry);
            try {
                save(KEY.reports, state.reports);
            }
            catch {
                toast('Espacio local insuficiente. Usa Firebase para guardar evidencias.', 'bad');
            }
        }
        delete form.dataset.sending;
        close();
        navigate('canton/' + canton);
        if (firebaseEnabled)
            void getCantonTotals(cantons.map(c => c.slug)).then(t => { state.cantonTotals = t; if (!state.dialogue && !document.querySelector('form:focus-within'))
                requestRouteRender(); });
        toast(publishWarning || 'Funa publicada.', publishWarning ? 'bad' : 'ok');
    }
    catch (e) {
        const message = e?.code === 'permission-denied' ? 'Firebase rechazó la publicación. Comprueba tu sesión y los permisos del proyecto.' : e?.message || 'No se pudo publicar. Tu texto se conserva para reintentar.';
        toast(message, 'bad');
        form.querySelectorAll('input,textarea,button').forEach(control => control.disabled = false);
        btn.textContent = 'Publicar';
    }
    finally {
        delete form.dataset.sending;
    }
}
async function sendReply(form) {
    if (!state.user || !state.thread || form.dataset.sending === '1')
        return;
    const value = String(new FormData(form).get('reply') || '').trim();
    if (value.length < 8 || value.length > 700) {
        toast('El comentario debe tener entre 8 y 700 caracteres.', 'bad');
        return;
    }
    if (unsupportedContent(value)) {
        toast('No incluyas teléfonos ni correos personales.', 'bad');
        return;
    }
    const parent = state.replyTarget;
    form.dataset.sending = '1';
    const submit = form.querySelector('button[type=submit]');
    if (submit)
        submit.disabled = true;
    try {
        if (firebaseEnabled)
            await addNestedReply(state.thread, value, state.user, parent);
        else {
            state.replies.push({ id: crypto.randomUUID(), reportId: state.thread, text: value, authorUid: state.user.uid, authorAlias: 'Anónimo', status: 'approved', createdAt: Date.now(), ...(parent ? { parentId: parent } : {}) });
            save(KEY.replies, state.replies);
        }
        form.reset();
        state.replyTarget = null;
        renderInlineThread();
        toast(parent ? 'Respuesta publicada.' : 'Comentario publicado.');
    }
    catch (e) {
        toast(e?.message || 'No se pudo publicar el comentario.', 'bad');
    }
    finally {
        delete form.dataset.sending;
        if (submit)
            submit.disabled = false;
    }
}
async function updateOwnComment(form) {
    const id = form.dataset.id || '', reportId = state.thread, user = state.user;
    if (!reportId || !user)
        return;
    const reply = allReplies().find(r => r.id === id && r.reportId === reportId);
    if (!reply || reply.authorUid !== user.uid)
        return;
    const text = String(new FormData(form).get('text') || '').trim();
    if (text.length < 8 || text.length > 700 || unsupportedContent(text)) {
        toast('Revisa el comentario: entre 8 y 700 caracteres, sin datos de contacto.', 'bad');
        return;
    }
    try {
        if (firebaseEnabled)
            await editReplyText(reportId, id, text);
        else {
            reply.text = text;
            reply.editedAt = Date.now();
            save(KEY.replies, state.replies);
        }
        state.editReplyId = null;
        renderInlineThread();
        toast('Comentario editado.');
    }
    catch (e) {
        toast(e?.message || 'No se pudo editar.', 'bad');
    }
}
async function removeOwnComment(id) {
    if (!state.user || !state.thread)
        return;
    const reply = allReplies().find(r => r.id === id && r.reportId === state.thread);
    if (!reply || reply.authorUid !== state.user.uid)
        return;
    if (!window.confirm('¿Eliminar tu comentario? Desaparecerá de la publicación.'))
        return;
    try {
        if (firebaseEnabled)
            await deleteOwnReply(state.thread, id);
        else {
            state.replies = state.replies.filter(r => r.id !== id);
            save(KEY.replies, state.replies);
            const votes = localCommentVotes();
            delete votes[reactionKey(state.thread, id)];
            save(KEY.commentReactions, votes);
        }
        if (state.replyTarget === id)
            state.replyTarget = null;
        if (state.editReplyId === id)
            state.editReplyId = null;
        renderInlineThread();
        toast('Comentario eliminado.');
    }
    catch (e) {
        toast(e?.message || 'No se pudo eliminar el comentario.', 'bad');
    }
}
async function sendUpdate(form) {
    if (!state.user || !state.updatesPost || form.dataset.sending === '1')
        return;
    const report = allReports().find(r => r.id === state.updatesPost && r.status === 'approved');
    if (!report || report.authorUid !== state.user.uid)
        return;
    const text = String(new FormData(form).get('update') || '').trim();
    if (text.length < 10 || text.length > 1000 || unsupportedContent(text)) {
        toast('La actualización debe tener entre 10 y 1000 caracteres, sin datos personales de contacto.', 'bad');
        return;
    }
    const submit = form.querySelector('button[type=submit]');
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'Publicando…';
    }
    form.querySelectorAll('input,textarea,button').forEach(control => control.disabled = true);
    form.dataset.sending = '1';
    let warning = '';
    try {
        if (firebaseEnabled) {
            const result = await addFunaUpdate(report.id, text, [...updateFiles]);
            warning = result.warning || '';
        }
        else {
            const u = { id: crypto.randomUUID(), reportId: report.id, text, authorUid: state.user.uid, createdAt: Date.now(), media: [] };
            for (const file of updateFiles)
                u.media.push({ id: String(u.media.length), ownerUid: state.user.uid, name: file.name, type: file.type, size: file.size, chunks: Math.ceil(file.size / (48 * 1024)), localUrl: URL.createObjectURL(file) });
            save(KEY.updates, [...localUpdates(), u]);
        }
        updateFiles = [];
        updateDraftText = '';
        form.reset();
        delete form.dataset.sending;
        renderModal();
        toast(warning || 'Actualización publicada con fecha.', warning ? 'bad' : 'ok');
    }
    catch (e) {
        toast(e?.message || 'No se pudo publicar la actualización.', 'bad');
        form.querySelectorAll('input,textarea,button').forEach(control => control.disabled = false);
        if (submit)
            submit.textContent = 'Publicar actualización';
    }
    finally {
        delete form.dataset.sending;
    }
}
async function sendFlag(form) {
    if (!state.flagId || !state.user)
        return;
    const data = new FormData(form), reason = String(data.get('reason') || ''), details = String(data.get('details') || '').trim();
    if (!['Acoso', 'Datos personales', 'Imágenes sin consentimiento', 'Otro'].includes(reason))
        return;
    if (reason === 'Otro' && (details.length < 10 || details.length > 500)) {
        toast('Explica tu motivo en 10 a 500 caracteres.', 'bad');
        return;
    }
    const btn = form.querySelector('button[type=submit]');
    if (btn)
        btn.disabled = true;
    try {
        if (firebaseEnabled)
            await flagReport(state.flagId, reason, state.user, state.flagReplyId, details);
        else {
            const all = read('funados_todos_flags_v3', []);
            if (all.some(x => x.id === state.flagId && x.uid === state.user?.uid && x.replyId === state.flagReplyId))
                throw Error('Ya enviaste este reporte.');
            all.push({ id: state.flagId, uid: state.user.uid, replyId: state.flagReplyId || null, reason, details, date: Date.now() });
            save('funados_todos_flags_v3', all);
        }
        close();
        toast('Reporte enviado.');
    }
    catch (e) {
        toast(e?.message || 'No se pudo enviar.', 'bad');
        if (btn)
            btn.disabled = false;
    }
}
async function sendTiktok(form) { const user = String(new FormData(form).get('username') || '').trim().replace(/^@/, ''); if (!/^[a-zA-Z0-9._]{2,24}$/.test(user)) {
    toast('Nombre de usuario inválido.', 'bad');
    return;
} try {
    if (firebaseEnabled && state.user)
        await saveTikTok(user, { ...state.user, alias: 'Anónimo' });
    state.profileName = user;
    save(KEY.tiktok, user);
    close();
    navigate('tiktok');
    toast('Enlace de TikTok añadido.');
}
catch (e) {
    toast(e?.message || 'Error al guardar.', 'bad');
} }
async function removeTikTok() { if (!state.user)
    return; if (!window.confirm('¿Eliminar tu cuenta de TikTok? Dejará de mostrarse públicamente.'))
    return; try {
    if (firebaseEnabled)
        await deleteTikTok(state.user.uid);
    state.profileName = '';
    localStorage.removeItem(KEY.tiktok);
    render();
    toast('Tu cuenta de TikTok fue eliminada.');
}
catch (e) {
    toast(e?.message || 'No se pudo eliminar la cuenta de TikTok.', 'bad');
} }
document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el)
        return;
    const a = el.dataset.action || '';
    if (a === 'gallery-open') {
        if (modal.querySelector('form[data-sending="1"]'))
            return;
        viewerReturnUpdates = state.dialogue === 'updates';
        const r = allReports().find(p => p.id === el.dataset.post);
        if (r) {
            previewItems = galleryItems(r, el.dataset.update || undefined);
            pushOverlayHistory();
            await previewAt(Number(el.dataset.index || 0));
        }
        return;
    }
    if (a === 'viewer-prev' || a === 'viewer-next') {
        await previewAt(previewIndex + (a === 'viewer-next' ? 1 : -1));
        return;
    }
    if (a === 'reveal-sensitive') {
        const id = el.dataset.id || '';
        const post = allReports().find(r => r.id === id && ['approved', 'pending'].includes(r.status));
        if (!post || post.sensitiveContent !== true)
            return;
        revealedSensitivePosts.add(id);
        render();
        return;
    }
    if (a === 'hide-sensitive') {
        const id = el.dataset.id || '';
        revealedSensitivePosts.delete(id);
        if (state.thread === id) {
            stopReplies();
            stopCommentReactionWatch();
            state.thread = null;
            state.remoteReplies = [];
        }
        render();
        return;
    }
    if (a === 'open-evidence') {
        const post = el.dataset.post || '', media = mediaById(post, el.dataset.file || '');
        if (!media)
            return;
        try {
            const url = await loadEvidenceURL(post, media);
            state.previewImage = url;
            state.previewMediaType = media.type;
            state.dialogue = 'image';
            pushOverlayHistory();
            renderModal();
        }
        catch (err) {
            toast(err?.message || 'No se pudo cargar la evidencia.', 'bad');
        }
    }
    else if (a === 'react-comment')
        await reactToComment(el.dataset.parent || '', el.dataset.id || '', el.dataset.kind);
    else if (a === 'load-more') {
        if (el.disabled)
            return;
        el.disabled = true;
        try {
            const n = await loadMoreReports();
            toast(n ? 'Se cargaron más publicaciones.' : 'No hay más publicaciones.');
            render();
        }
        catch (err) {
            toast('No se pudieron cargar más publicaciones: ' + (err?.code || 'comprueba conexión e índices.'), 'bad');
            el.disabled = false;
        }
    }
    else if (a === 'react')
        await reactToReport(el.dataset.id || '', el.dataset.kind);
    else if (a === 'nav')
        navigate(el.dataset.page || 'inicio');
    else if (a === 'toggle-menu') {
        state.menu = !state.menu;
        if (state.menu)
            pushOverlayHistory();
        render();
    }
    else if (a === 'guest') {
        state.dialogue = 'guest';
        pushOverlayHistory();
        renderModal();
    }
    else if (a === 'google')
        await enterGoogle();
    else if (a === 'compose') {
        if (segs()[0] !== 'canton') {
            toast('Abre primero un cantón para publicar.', 'bad');
            return;
        }
        state.imageFiles = [];
        state.dialogue = 'compose';
        pushOverlayHistory();
        renderModal();
    }
    else if (a === 'tiktok-add') {
        state.dialogue = 'tiktok';
        pushOverlayHistory();
        renderModal();
    }
    else if (a === 'logout')
        await logOut();
    else if (a === 'close-menu') {
        state.menu = false;
        if (history.state?.funadosOverlay)
            history.replaceState(null, '', location.href);
        render();
    }
    else if (a === 'image') {
        const uri = el.dataset.image || '';
        if (!/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(uri))
            return;
        state.previewImage = uri;
        state.previewMediaType = 'image/jpeg';
        state.dialogue = 'image';
        pushOverlayHistory();
        renderModal();
    }
    else if (a === 'share') {
        const post = allReports().find(r => r.id === el.dataset.id);
        if (post) {
            const url = location.origin + location.pathname + '#/funa/' + encodeURIComponent(post.id);
            try {
                if (navigator.share) {
                    await navigator.share({ title: post.title, text: 'Mira esta publicación en Funados Todos', url });
                    toast('Enlace compartido.');
                }
                else {
                    await navigator.clipboard.writeText(url);
                    toast('Enlace copiado.');
                }
            }
            catch (err) {
                if (err?.name !== 'AbortError')
                    try {
                        await navigator.clipboard.writeText(url);
                        toast('Enlace copiado.');
                    }
                    catch {
                        window.prompt('Copia este enlace:', url);
                    }
            }
        }
    }
    else if (a === 'reply-to') {
        state.replyTarget = el.dataset.id || null;
        state.editReplyId = null;
        renderInlineThread();
        app.querySelector('#reply-text')?.focus();
    }
    else if (a === 'cancel-reply') {
        state.replyTarget = null;
        renderInlineThread();
    }
    else if (a === 'edit-comment') {
        state.editReplyId = el.dataset.id || null;
        renderInlineThread();
        app.querySelector('#edit-reply-text')?.focus();
    }
    else if (a === 'cancel-edit') {
        state.editReplyId = null;
        renderInlineThread();
    }
    else if (a === 'delete-comment')
        await removeOwnComment(el.dataset.id || '');
    else if (a === 'delete-tiktok')
        await removeTikTok();
    else if (a === 'updates') {
        stopUpdates();
        updateFiles = [];
        updateDraftText = '';
        state.replyTarget = null;
        state.editReplyId = null;
        state.updatesPost = el.dataset.id || null;
        state.currentUpdates = [];
        state.dialogue = 'updates';
        pushOverlayHistory();
        if (firebaseEnabled)
            stopUpdates = listenFunaUpdates(state.updatesPost, v => { state.currentUpdates = v; if (state.dialogue === 'updates' && !modal.querySelector('form[data-sending="1"]'))
                renderModal(); });
        renderModal();
    }
    else if (a === 'flag') {
        state.flagId = el.dataset.id || null;
        state.flagReplyId = null;
        state.dialogue = 'flag';
        pushOverlayHistory();
        renderModal();
    }
    else if (a === 'flag-reply') {
        state.flagId = el.dataset.parent || null;
        state.flagReplyId = el.dataset.id || null;
        state.dialogue = 'flag';
        pushOverlayHistory();
        renderModal();
    }
    else if (a === 'thread') {
        toggleInlineThread(el.dataset.id || '');
    }
    else if (a === 'close')
        close();
    else if (a === 'close-overlay' && e.target === el)
        close();
});
document.addEventListener('submit', async (e) => { const form = e.target; if (!['compose-form', 'reply-form', 'flag-form', 'tiktok-form', 'guest-form', 'alias-form', 'update-form', 'edit-reply-form'].includes(form.id))
    return; e.preventDefault(); if (form.id === 'compose-form')
    await createFuna(form); if (form.id === 'reply-form')
    await sendReply(form); if (form.id === 'update-form')
    await sendUpdate(form); if (form.id === 'edit-reply-form')
    await updateOwnComment(form); if (form.id === 'flag-form')
    await sendFlag(form); if (form.id === 'tiktok-form')
    await sendTiktok(form); if (form.id === 'guest-form')
    await enterGuest(String(new FormData(form).get('alias') || '')); if (form.id === 'alias-form')
    await editAlias(form); });
document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'update-images') {
        const files = Array.from(el.files || []);
        const error = files.length > 4 ? 'Adjunta hasta cuatro fotos.' : checkImages(files) || (files.some(f => !f.type.startsWith('image/')) ? 'Solo se permiten fotos en las actualizaciones.' : '');
        if (error) {
            toast(error, 'bad');
            el.value = '';
            updateFiles = [];
        }
        else
            updateFiles = files;
        const label = document.getElementById('selected-update-images');
        if (label)
            label.textContent = updateFiles.map(f => f.name).join(' · ');
        return;
    }
    if (el.id === 'flag-reason') {
        const box = document.getElementById('flag-extra-wrap'), field = document.getElementById('flag-details');
        if (box)
            box.hidden = el.value !== 'Otro';
        if (field)
            field.required = el.value === 'Otro';
        return;
    }
    if (el.id === 'pref-animations' || el.id === 'pref-compact') {
        state.prefs[el.id === 'pref-animations' ? 'animations' : 'compact'] = el.checked;
        save(KEY.prefs, state.prefs);
        applyPrefs();
        toast('Preferencia guardada.');
        return;
    }
    if (el.id === 'sort-posts') {
        state.sort = el.value;
        render();
        return;
    }
    if (el.id !== 'post-images')
        return;
    const files = Array.from(el.files || []), error = checkImages(files);
    if (error) {
        toast(error, 'bad');
        state.imageFiles = [];
        el.value = '';
    }
    else
        state.imageFiles = files;
    const preview = document.getElementById('selected-images');
    if (preview)
        preview.textContent = state.imageFiles.length ? state.imageFiles.map(f => f.name).join(' · ') : '';
});
document.addEventListener('input', e => { const el = e.target; if (el.id !== 'search')
    return; state.search = el.value; const grid = document.getElementById('cantons-grid'); if (grid) {
    const q = el.value.trim().toLocaleLowerCase('es');
    grid.innerHTML = rankedCantons().filter(c => c.name.toLocaleLowerCase('es').includes(q)).map(cantonCard).join('') || '<p class="search-empty">Sin resultados.</p>';
} });
document.addEventListener('keydown', e => { if (state.dialogue === 'image' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    void previewAt(previewIndex + (e.key === 'ArrowRight' ? 1 : -1));
    return;
} if (e.key === 'Escape') {
    if (document.fullscreenElement)
        return;
    if (state.menu) {
        state.menu = false;
        if (history.state?.funadosOverlay)
            history.replaceState(null, '', location.href);
        render();
    }
    else if (state.dialogue)
        close();
    else if (state.thread)
        toggleInlineThread(state.thread);
    return;
} if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing && e.target instanceof HTMLTextAreaElement) {
    const form = e.target.closest('form');
    if (form) {
        e.preventDefault();
        form.requestSubmit();
    }
} });
window.addEventListener('popstate', () => { if (state.menu) {
    state.menu = false;
    render();
}
else if (state.dialogue)
    close();
else if (state.thread)
    toggleInlineThread(state.thread);
else if (location.hash !== lastRenderedHash)
    requestRouteRender(); });
window.addEventListener('hashchange', () => { if (location.hash === lastRenderedHash)
    return; state.menu = false; state.search = ''; requestRouteRender(); });
applyPrefs();
render();
initFirebase(user => { if (user)
    void trackVisit(user).catch(() => { }); setUser(user); }).then(active => { if (!active) {
    const id = sessionStorage.getItem(KEY.session);
    if (id)
        setUser({ uid: id, alias: read(KEY.alias, 'Invitado'), isAnonymous: true });
} }).catch(() => toast('No se pudo conectar. Comprueba la configuración y la conexión.', 'bad'));
