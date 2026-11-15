const cfg = window.FUNADOS_FIREBASE_CONFIG || {};
export const firebaseEnabled = Boolean(cfg.apiKey && !String(cfg.apiKey).includes('REEMPLAZAR') && cfg.projectId && !String(cfg.projectId).includes('REEMPLAZAR'));
let modules = null;
let auth, db, rtdb;
// La versión CDN es compatible con Live Server. No hay secretos en la config pública.
const origin = 'https://www.gstatic.com/firebasejs/11.10.0';
const REPORT_PAGE_SIZE = 100;
let reportCursor = null;
let moreReports = false;
let extraReports = [];
let emitLoadedReports = () => { };
export async function initFirebase(onUser) {
    if (!firebaseEnabled)
        return false;
    try {
        const [app, authMod, firestore] = await Promise.all([
            import(/* @vite-ignore */ `${origin}/firebase-app.js`),
            import(/* @vite-ignore */ `${origin}/firebase-auth.js`),
            import(/* @vite-ignore */ `${origin}/firebase-firestore.js`),
        ]);
        const firebaseApp = app.initializeApp(cfg);
        auth = authMod.getAuth(firebaseApp);
        db = firestore.getFirestore(firebaseApp);
        // RTDB es necesaria para las evidencias; autenticación y Firestore pueden funcionar sin ella.
        // No deducir la URL, ya que depende de la región e instancia seleccionadas.
        let database = null;
        if (typeof cfg.databaseURL === 'string' && cfg.databaseURL.trim()) {
            try {
                database = await import(/* @vite-ignore */ `${origin}/firebase-database.js`);
                rtdb = database.getDatabase(firebaseApp, cfg.databaseURL.trim());
            }
            catch (error) {
                console.warn('Realtime Database no disponible. Las otras funciones siguen activas.', error);
            }
        }
        modules = { authMod, firestore, database };
        authMod.onAuthStateChanged(auth, (u) => onUser(u ? { uid: u.uid, alias: u.displayName || (u.isAnonymous ? 'Invitado' : 'Mi cuenta'), photoURL: u.photoURL || '', isAnonymous: u.isAnonymous } : null));
        return true;
    }
    catch (err) {
        console.error('Firebase no disponible:', err);
        throw err;
    }
}
export async function loginGoogle() {
    if (!modules)
        throw new Error('Firebase aún no está configurado.');
    return modules.authMod.signInWithPopup(auth, new modules.authMod.GoogleAuthProvider());
}
export async function loginGuest() {
    if (!modules)
        throw new Error('Firebase aún no está configurado.');
    return modules.authMod.signInAnonymously(auth);
}
export async function saveAlias(uid, alias) {
    if (!modules || auth?.currentUser?.uid !== uid)
        throw new Error('Sesión no disponible.');
    await modules.firestore.setDoc(modules.firestore.doc(db, 'userPrefs', uid), { uid, alias, updatedAt: modules.firestore.serverTimestamp() }, { merge: true });
}
export async function logoutFirebase() { if (modules)
    await modules.authMod.signOut(auth); }
export function hasMoreReports() { return moreReports; }
export async function fetchReportById(id) {
    if (!modules || !/^[a-zA-Z0-9_-]{8,90}$/.test(id))
        return null;
    const f = modules.firestore, snap = await f.getDoc(f.doc(db, 'reports', id));
    if (!snap.exists())
        return null;
    const d = snap.data();
    return { ...d, id: snap.id, createdAt: d.createdAt?.toMillis?.() || Date.now() };
}
export async function countMyReports(uid) {
    if (!modules || auth?.currentUser?.uid !== uid)
        return 0;
    const f = modules.firestore;
    const snap = await f.getCountFromServer(f.query(f.collection(db, 'reports'), f.where('authorUid', '==', uid)));
    return snap.data().count;
}
/** Trae otra página sin descargar de nuevo el feed completo. */
export async function loadMoreReports() {
    if (!modules || !reportCursor || !moreReports)
        return 0;
    const f = modules.firestore;
    const query = f.query(f.collection(db, 'reports'), f.where('status', '==', 'approved'), f.orderBy(f.documentId()), f.startAfter(reportCursor), f.limit(REPORT_PAGE_SIZE));
    const snap = await f.getDocs(query);
    const map = (d) => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toMillis?.() || Date.now() });
    extraReports.push(...snap.docs.map(map));
    if (snap.docs.length)
        reportCursor = snap.docs[snap.docs.length - 1];
    moreReports = snap.docs.length === REPORT_PAGE_SIZE;
    emitLoadedReports();
    return snap.docs.length;
}
/** Conteo exacto por cantón cuando hay conexión e índices desplegados. */
export async function getCantonTotals(slugs) {
    if (!modules)
        return {};
    const f = modules.firestore;
    const pairs = await Promise.all(slugs.map(async (slug) => {
        try {
            const q = f.query(f.collection(db, 'reports'), f.where('status', '==', 'approved'), f.where('canton', '==', slug));
            const snap = await f.getCountFromServer(q);
            return [slug, snap.data().count];
        }
        catch (err) {
            console.warn('Conteo de cantón', slug, err);
            return [slug, -1];
        }
    }));
    return Object.fromEntries(pairs.filter(([_, count]) => count >= 0));
}
export function listenReports(onData, uid, onError = () => { }) {
    if (!modules)
        return () => { };
    const f = modules.firestore;
    reportCursor = null;
    moreReports = false;
    extraReports = [];
    const approvedQuery = f.query(f.collection(db, 'reports'), f.where('status', '==', 'approved'), f.orderBy(f.documentId()), f.limit(REPORT_PAGE_SIZE));
    const mineQuery = f.query(f.collection(db, 'reports'), f.where('authorUid', '==', uid), f.limit(REPORT_PAGE_SIZE));
    let approved = [], owned = [];
    const emit = () => onData([...new Map([...approved, ...extraReports, ...owned].map(p => [p.id, p])).values()].sort((a, b) => b.createdAt - a.createdAt));
    emitLoadedReports = emit;
    const mapSnap = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toMillis?.() || Date.now() }));
    const stopA = f.onSnapshot(approvedQuery, (snap) => {
        approved = mapSnap(snap);
        if (!extraReports.length) {
            reportCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            moreReports = snap.docs.length === REPORT_PAGE_SIZE;
        }
        emit();
    }, (e) => { console.warn('Consulta pública:', e); onError(e); });
    const stopB = f.onSnapshot(mineQuery, (snap) => { owned = mapSnap(snap); emit(); }, (e) => { console.warn('Consulta personal:', e); onError(e); });
    return () => { stopA(); stopB(); reportCursor = null; moreReports = false; extraReports = []; emitLoadedReports = () => { }; };
}
// Los archivos se dividen en bloques de 48 KiB en Realtime Database.
// Firestore almacena EXCLUSIVAMENTE referencias y metadatos, nunca bytes de vídeo o imagen.
const CHUNK_BYTES = 48 * 1024;
const mediaCache = new Map();
const mediaRoot = (owner, post, file) => `evidence/${owner}/${post}/files/${file}`;
function encodeBlock(buf) {
    let binary = '';
    for (let start = 0; start < buf.length; start += 8192)
        binary += String.fromCharCode(...buf.subarray(start, start + 8192));
    return btoa(binary);
}
function decodeBlock(value) {
    const bin = atob(value), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return bytes;
}
export function realtimeMediaAvailable() { return Boolean(modules?.database && rtdb); }
export function clearEvidenceCache() { mediaCache.forEach(v => URL.revokeObjectURL(v)); mediaCache.clear(); }
export async function loadEvidenceURL(reportId, item) {
    if (item.localUrl)
        return item.localUrl;
    const path = mediaRoot(item.ownerUid, reportId, item.id);
    if (mediaCache.has(path))
        return mediaCache.get(path);
    if (!realtimeMediaAvailable())
        throw new Error('Falta configurar Realtime Database.');
    const d = modules.database;
    const snap = await d.get(d.ref(rtdb, `${path}/chunks`));
    const blocks = snap.val();
    if (!blocks)
        throw new Error('La evidencia no está disponible.');
    if (item.chunks < 1 || item.chunks > 220)
        throw new Error('Evidencia inválida.');
    const bytes = [];
    let total = 0;
    for (let i = 0; i < item.chunks; i++) {
        const raw = blocks[String(i)];
        if (typeof raw !== 'string')
            throw new Error('Archivo incompleto.');
        const block = decodeBlock(raw);
        total += block.byteLength;
        bytes.push(block);
    }
    if (total !== item.size)
        throw new Error('La evidencia está incompleta.');
    const blob = new Blob(bytes, { type: item.type });
    const url = URL.createObjectURL(blob);
    mediaCache.set(path, url);
    return url;
}
async function uploadEvidence(file, owner, reportId, slot) {
    const d = modules.database;
    const id = String(slot); // RTDB permite únicamente posiciones 0–9 para imponer diez evidencias.
    const chunks = Math.ceil(file.size / CHUNK_BYTES);
    const media = { id, ownerUid: owner, name: file.name.slice(0, 90), type: file.type, size: file.size, chunks };
    const path = mediaRoot(owner, reportId, id);
    await d.set(d.ref(rtdb, `${path}/meta`), { ...media, createdAt: d.serverTimestamp() });
    // Agrupa los fragmentos en lotes de 12: evita cientos de viajes de red por vídeo.
    const tasks = [];
    for (let start = 0; start < chunks; start += 12) {
        const promise = (async () => {
            const batch = {};
            for (let i = start; i < Math.min(start + 12, chunks); i++) {
                const bytes = new Uint8Array(await file.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES).arrayBuffer());
                batch[String(i)] = encodeBlock(bytes);
            }
            await d.update(d.ref(rtdb, `${path}/chunks`), batch);
        })();
        tasks.push(promise);
        if (tasks.length === 3) {
            await Promise.all(tasks);
            tasks.length = 0;
        }
    }
    if (tasks.length)
        await Promise.all(tasks);
    return media;
}
export async function addReport(data, files) {
    if (!modules || !auth?.currentUser)
        throw new Error('Inicia sesión para publicar.');
    if (files.length > 10)
        throw new Error('Solo puedes subir diez evidencias.');
    if (files.length && !realtimeMediaAvailable())
        throw new Error('Activa Realtime Database y añade databaseURL para subir evidencias.');
    const f = modules.firestore, owner = auth.currentUser.uid;
    const media = [];
    let published = false;
    try {
        for (const [slot, file] of files.entries())
            media.push(await uploadEvidence(file, owner, data.id, slot));
        await f.setDoc(f.doc(db, 'reports', data.id), { ...data, images: [], media, status: 'approved', createdAt: f.serverTimestamp() });
        published = true;
        // La visibilidad se registra solo para el autor; el panel puede bloquearla al retirar contenido.
        if (files.length)
            await modules.database.set(modules.database.ref(rtdb, `evidenceVisibility/${data.id}`), { ownerUid: owner, visible: true });
    }
    catch (err) {
        // Intento de limpieza si falla el guardado de Firestore o de un fragmento.
        if (!published && files.length && realtimeMediaAvailable()) {
            await modules.database.remove(modules.database.ref(rtdb, `evidence/${owner}/${data.id}`)).catch(() => { });
        }
        if (published)
            throw new Error('La funa se guardó. La visibilidad de sus archivos se habilita desde el servidor.');
        throw err;
    }
}
export function listenReplies(reportId, uid, onData, onError = () => { }) {
    if (!modules)
        return () => { };
    const f = modules.firestore;
    // Una sola escucha: evita que un comentario llegue por dos consultas simultáneas.
    // Los comentarios se publican en status approved, y la consulta coincide con las reglas.
    const q = f.query(f.collection(db, `reports/${reportId}/replies`), f.where('status', '==', 'approved'), f.limit(200));
    return f.onSnapshot(q, (snap) => onData(snap.docs.map((d) => ({ id: d.id, reportId, ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || Date.now(), editedAt: d.data().editedAt?.toMillis?.() || null })).sort((a, b) => a.createdAt - b.createdAt)), onError);
}
export async function addReply(reportId, text, user) {
    const f = modules.firestore;
    await f.addDoc(f.collection(db, `reports/${reportId}/replies`), { reportId, text, authorUid: user.uid, authorAlias: user.alias, status: 'approved', createdAt: f.serverTimestamp() });
}
export function trackPresence(user, onCount) {
    // La presencia solo se habilita cuando se proporcionó databaseURL.
    if (!modules?.database || !rtdb)
        return () => { };
    const d = modules.database, path = d.ref(rtdb, `presence/${user.uid}`);
    const connection = d.ref(rtdb, '.info/connected');
    const unsubC = d.onValue(connection, (s) => { if (s.val()) {
        d.onDisconnect(path).remove();
        d.set(path, { online: true, lastSeen: d.serverTimestamp() }).catch(() => { });
    } });
    // No hay lectura masiva de presence: sería un permiso de privacidad incorrecto.
    onCount(0);
    return () => { unsubC(); d.remove(path).catch(() => { }); };
}
/** Registra una visita única por cuenta; el panel solo recibe el total. */
export async function trackVisit(user) {
    if (!modules?.database || !rtdb)
        return;
    const d = modules.database, ref = d.ref(rtdb, `visits/${user.uid}`);
    // Las reglas permiten crear la visita propia, pero su lectura es administrativa.
    // Una segunda visita rechaza la escritura y conserva la fecha original.
    try {
        await d.set(ref, { firstSeen: d.serverTimestamp() });
    }
    catch (error) {
        if (!/permission.denied/i.test(String(error?.code || '')))
            throw error;
    }
}
export async function saveTikTok(username, user) {
    if (!modules)
        throw new Error('Firebase no disponible');
    await modules.firestore.setDoc(modules.firestore.doc(db, `profiles/${user.uid}`), { uid: user.uid, alias: user.alias, tiktokUsername: username, tiktokVerified: false, updatedAt: modules.firestore.serverTimestamp() }, { merge: true });
}
/** Solo se borra el documento del UID autenticado; las reglas revalidan esa propiedad. */
export async function deleteTikTok(uid) {
    if (!modules || !auth?.currentUser || auth.currentUser.uid !== uid)
        throw new Error('Solo puedes eliminar tu propia cuenta de TikTok.');
    await modules.firestore.deleteDoc(modules.firestore.doc(db, `profiles/${uid}`));
}
export function listenTikTok(onData) {
    if (!modules)
        return () => { };
    return modules.firestore.onSnapshot(modules.firestore.query(modules.firestore.collection(db, 'profiles'), modules.firestore.limit(100)), (snap) => onData(snap.docs.map((d) => d.data()).filter((v) => v.tiktokUsername)), (e) => console.warn(e));
}
export async function flagReport(reportId, reason, user, replyId = null, details = '') {
    if (!modules || !auth.currentUser || auth.currentUser.uid !== user.uid)
        throw new Error('Inicia sesión para reportar.');
    const f = modules.firestore;
    const id = reportId + '_' + (replyId || 'post') + '_' + user.uid;
    try {
        await f.setDoc(f.doc(db, 'flags', id), { reportId, reason, reporterUid: user.uid, replyId: replyId || 'post', ...(reason === 'Otro' ? { details: details.trim() } : {}), createdAt: f.serverTimestamp() });
    }
    catch (e) {
        if (e?.code === 'permission-denied')
            throw new Error('Ya enviaste un reporte sobre esta publicación, o el servidor rechazó el permiso.');
        throw e;
    }
}
const zeroReactionCounts = () => ({ like: 0, wow: 0, concern: 0 });
export function listenReactionSummary(reportId, uid, onChange) {
    if (!modules)
        return () => { };
    const f = modules.firestore;
    const stats = f.doc(db, 'reports', reportId, 'reactionStats', 'summary');
    const own = f.doc(db, 'reports', reportId, 'reactions', uid);
    let totals = zeroReactionCounts(), mine = 'none';
    const emit = () => onChange({ ...totals }, mine);
    const stopTotals = f.onSnapshot(stats, (snap) => { const value = snap.data() || {}; totals = { like: value.like || 0, wow: value.wow || 0, concern: value.concern || 0 }; emit(); }, (err) => console.warn('No se pudo leer el contador', err));
    const stopMine = f.onSnapshot(own, (snap) => { mine = (snap.data()?.kind || 'none'); emit(); }, (err) => console.warn('No se pudo leer la reacción', err));
    return () => { stopTotals(); stopMine(); };
}
export async function setReaction(reportId, next) {
    if (!modules || !auth?.currentUser)
        throw new Error('Inicia sesión para reaccionar.');
    if (!['like', 'wow', 'concern', 'none'].includes(next))
        throw new Error('Reacción inválida.');
    const f = modules.firestore;
    const vote = f.doc(db, 'reports', reportId, 'reactions', auth.currentUser.uid);
    const summary = f.doc(db, 'reports', reportId, 'reactionStats', 'summary');
    await f.runTransaction(db, async (tx) => {
        const [oldVote, oldSummary] = await Promise.all([tx.get(vote), tx.get(summary)]);
        const previous = (oldVote.data()?.kind || 'none');
        const counts = { like: 0, wow: 0, concern: 0, ...(oldSummary.data() || {}) };
        if (previous !== 'none')
            counts[previous] = Math.max(0, counts[previous] - 1);
        if (next !== 'none')
            counts[next]++;
        tx.set(vote, { kind: next, updatedAt: f.serverTimestamp() });
        tx.set(summary, { like: counts.like, wow: counts.wow, concern: counts.concern, updatedAt: f.serverTimestamp() });
    });
}
/** Respuestas anónimas, editables por su autor y anidadas. */
export async function addNestedReply(reportId, text, user, parentId = null) {
    if (!modules || !auth?.currentUser || auth.currentUser.uid !== user.uid)
        throw new Error('Inicia sesión para comentar.');
    const f = modules.firestore;
    await f.addDoc(f.collection(db, `reports/${reportId}/replies`), {
        reportId, text, authorUid: user.uid, authorAlias: 'Anónimo', status: 'approved',
        ...(parentId ? { parentId } : {}), createdAt: f.serverTimestamp()
    });
}
export async function editReplyText(reportId, replyId, text) {
    if (!modules || !auth?.currentUser)
        throw new Error('Inicia sesión para editar.');
    const f = modules.firestore;
    await f.updateDoc(f.doc(db, 'reports', reportId, 'replies', replyId), { text, editedAt: f.serverTimestamp() });
}
export async function deleteOwnReply(reportId, replyId) {
    if (!modules || !auth?.currentUser)
        throw new Error('Inicia sesión para eliminar.');
    const f = modules.firestore;
    await f.deleteDoc(f.doc(db, 'reports', reportId, 'replies', replyId));
}
export function listenFunaUpdates(reportId, onData) {
    if (!modules)
        return () => { };
    const f = modules.firestore;
    return f.onSnapshot(f.query(f.collection(db, 'reports', reportId, 'updates'), f.orderBy('createdAt', 'asc'), f.limit(100)), (snap) => onData(snap.docs.map((d) => ({ id: d.id, reportId, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || Date.now() }))), (err) => console.warn('No se pudieron obtener las actualizaciones:', err));
}
export async function addFunaUpdate(reportId, text) {
    if (!modules || !auth?.currentUser)
        throw new Error('Inicia sesión para publicar.');
    const f = modules.firestore;
    await f.addDoc(f.collection(db, 'reports', reportId, 'updates'), { reportId, text, authorUid: auth.currentUser.uid, createdAt: f.serverTimestamp() });
}
/** Votos privados y totales públicos de cada comentario, en una transacción. */
export function listenCommentReactionSummary(reportId, commentId, uid, onChange) {
    if (!modules)
        return () => { };
    const f = modules.firestore;
    const totalRef = f.doc(db, 'reports', reportId, 'replies', commentId, 'reactionStats', 'summary');
    const myRef = f.doc(db, 'reports', reportId, 'replies', commentId, 'reactions', uid);
    let counts = zeroReactionCounts(), mine = 'none';
    const emit = () => onChange({ ...counts }, mine);
    const off1 = f.onSnapshot(totalRef, (snap) => { const v = snap.data() || {}; counts = { like: v.like || 0, wow: v.wow || 0, concern: v.concern || 0 }; emit(); }, (err) => console.warn('Reacciones de comentario:', err));
    const off2 = f.onSnapshot(myRef, (snap) => { mine = (snap.data()?.kind || 'none'); emit(); }, (err) => console.warn('Voto del comentario:', err));
    return () => { off1(); off2(); };
}
export async function setCommentReaction(reportId, commentId, next) {
    if (!modules || !auth?.currentUser)
        throw new Error('Inicia sesión para reaccionar.');
    if (!['like', 'wow', 'concern', 'none'].includes(next))
        throw new Error('Reacción inválida.');
    const f = modules.firestore;
    const vote = f.doc(db, 'reports', reportId, 'replies', commentId, 'reactions', auth.currentUser.uid);
    const summary = f.doc(db, 'reports', reportId, 'replies', commentId, 'reactionStats', 'summary');
    await f.runTransaction(db, async (tx) => {
        const [oldVote, oldSummary] = await Promise.all([tx.get(vote), tx.get(summary)]);
        const previous = (oldVote.data()?.kind || 'none');
        const counts = { like: 0, wow: 0, concern: 0, ...(oldSummary.data() || {}) };
        if (previous !== 'none')
            counts[previous] = Math.max(0, counts[previous] - 1);
        if (next !== 'none')
            counts[next]++;
        tx.set(vote, { kind: next, updatedAt: f.serverTimestamp() });
        tx.set(summary, { like: counts.like, wow: counts.wow, concern: counts.concern, updatedAt: f.serverTimestamp() });
    });
}
// La cuenta de TikTok es declarada por el usuario, no está certificada por TikTok.
