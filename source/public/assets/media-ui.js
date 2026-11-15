/** Controles multimedia propios. Sin autoplay ni librerías externas. */
const hydratedPlayers = new WeakSet(), hydratedCarousels = new WeakSet();
const galleryPositions = new Map();
const clock = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
function initMediaUI() {
    document.querySelectorAll('[data-carousel]').forEach(gallery => {
        if (hydratedCarousels.has(gallery))
            return;
        hydratedCarousels.add(gallery);
        const track = gallery.querySelector('.carousel-track');
        const slides = track.children.length, key = gallery.dataset.carousel || '';
        const sync = () => {
            const index = Math.max(0, Math.min(slides - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
            galleryPositions.set(key, index);
            const label = gallery.querySelector('[data-carousel-count]');
            if (label)
                label.textContent = `${index + 1} / ${slides}`;
            gallery.querySelectorAll('[data-carousel-dir]').forEach(b => b.disabled = b.dataset.carouselDir === '-1' ? index === 0 : index === slides - 1);
            gallery.querySelectorAll('[data-carousel-index]').forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
        };
        const move = (index) => track.scrollTo({ left: Math.max(0, Math.min(slides - 1, index)) * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        gallery.addEventListener('click', event => {
            const target = event.target.closest('[data-carousel-dir],[data-carousel-index]');
            if (!target)
                return;
            event.preventDefault();
            move(target.dataset.carouselIndex !== undefined ? Number(target.dataset.carouselIndex) : (galleryPositions.get(key) || 0) + Number(target.dataset.carouselDir));
        });
        gallery.addEventListener('keydown', event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            move((galleryPositions.get(key) || 0) + (event.key === 'ArrowRight' ? 1 : -1));
        } });
        track.addEventListener('scroll', sync, { passive: true });
        track.scrollLeft = (galleryPositions.get(key) || 0) * track.clientWidth;
        sync();
    });
    document.querySelectorAll('.video-player').forEach(shell => {
        if (hydratedPlayers.has(shell))
            return;
        hydratedPlayers.add(shell);
        const video = shell.querySelector('video'), play = shell.querySelector('[data-video-play]'), mute = shell.querySelector('[data-video-mute]'), seek = shell.querySelector('[data-video-seek]'), volume = shell.querySelector('[data-video-volume]'), time = shell.querySelector('[data-video-time]'), status = shell.querySelector('[data-video-status]');
        const sync = () => {
            play.textContent = video.paused ? '▶' : 'Ⅱ';
            play.setAttribute('aria-label', video.paused ? 'Reproducir vídeo' : 'Pausar vídeo');
            mute.textContent = video.muted || video.volume === 0 ? '🔇' : '🔊';
            mute.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar');
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            seek.disabled = duration <= 0;
            seek.max = String(duration || 1);
            seek.value = String(video.currentTime);
            seek.setAttribute('aria-valuetext', `${clock(video.currentTime)} de ${clock(duration)}`);
            time.textContent = `${clock(video.currentTime)} / ${clock(duration)}`;
        };
        play.onclick = async () => { try {
            if (video.paused)
                await video.play();
            else
                video.pause();
            status.textContent = '';
        }
        catch {
            status.textContent = 'No se pudo reproducir. Prueba descargando el archivo.';
        } };
        mute.onclick = () => { video.muted = !video.muted; sync(); };
        seek.oninput = () => { if (Number.isFinite(video.duration))
            video.currentTime = Number(seek.value); sync(); };
        volume.oninput = () => { video.volume = Number(volume.value); video.muted = video.volume === 0; sync(); };
        shell.querySelector('[data-video-speed]').onchange = e => { video.playbackRate = Number(e.target.value); };
        const full = shell.querySelector('[data-video-fullscreen]');
        full.onclick = async () => { try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else if (shell.requestFullscreen)
                await shell.requestFullscreen();
            else
                video.webkitEnterFullscreen?.();
        }
        catch {
            status.textContent = 'Pantalla completa no disponible en este navegador.';
        } };
        const pip = shell.querySelector('[data-video-pip]');
        pip.hidden = !(document.pictureInPictureEnabled && video.requestPictureInPicture);
        pip.onclick = async () => { try {
            if (document.pictureInPictureElement)
                await document.exitPictureInPicture();
            else
                await video.requestPictureInPicture();
        }
        catch {
            status.textContent = 'La ventana flotante no está disponible para este vídeo.';
        } };
        for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'volumechange', 'ended'])
            video.addEventListener(event, sync);
        video.addEventListener('waiting', () => status.textContent = 'Cargando vídeo…');
        video.addEventListener('playing', () => status.textContent = '');
        video.addEventListener('error', () => status.textContent = 'Este navegador no puede leer el vídeo. Puedes descargar el original.');
        video.volume = 0.8;
        volume.value = '0.8';
        sync();
    });
}
let mediaFrame = 0;
new MutationObserver(() => { if (!mediaFrame)
    mediaFrame = requestAnimationFrame(() => { mediaFrame = 0; initMediaUI(); }); }).observe(document.documentElement, { subtree: true, childList: true });
initMediaUI();
export function videoPlayerMarkup(url) {
    const safeUrl = String(url).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    return `<div class="video-player"><video src="${safeUrl}" playsinline preload="metadata" aria-label="Vídeo adjunto"></video><div class="video-controls"><input data-video-seek type="range" min="0" max="1" step="0.1" value="0" aria-label="Posición del vídeo"><div class="video-buttons"><button type="button" data-video-play aria-label="Reproducir vídeo">▶</button><span data-video-time>0:00 / 0:00</span><button type="button" data-video-mute aria-label="Silenciar">🔊</button><input data-video-volume type="range" min="0" max="1" step="0.05" value="0.8" aria-label="Volumen"><select data-video-speed aria-label="Velocidad de reproducción"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button type="button" data-video-pip aria-label="Ventana flotante">▣</button><button type="button" data-video-fullscreen aria-label="Pantalla completa">⛶</button></div><p data-video-status role="status"></p></div></div>`;
}
/** Conserva los bytes originales, con una extensión de descarga acorde al formato permitido. */
export function safeMediaFilename(name, type) {
    const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
    const base = String(name || 'evidencia').replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} _.-]/gu, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 72) || 'evidencia';
    return base + '.' + (extensions[type] || 'bin');
}
