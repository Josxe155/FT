# 🎞️ Galerías, vídeos y actualizaciones

Las evidencias de cada publicación se muestran en un carrusel con desplazamiento táctil, flechas, contador y puntos de posición. El visor ampliado recorre el mismo conjunto de archivos; también admite flechas del teclado y descarga de los archivos almacenados. La descarga conserva los bytes y normaliza la extensión según el formato permitido; no utiliza extensiones ejecutables aportadas en el nombre. Las imágenes HTTPS antiguas de terceros no reciben un botón de descarga directa. El contenido sensible oculta solo imágenes y vídeos hasta que la persona los revele, incluidas las fotos de las actualizaciones. El título, la descripción, los comentarios y las reacciones siguen visibles. El interruptor empieza deshabilitado y solo se habilita al adjuntar imágenes o vídeos; retirar todos los archivos lo desmarca. Las publicaciones antiguas sin archivos no reciben una cubierta aunque conserven la marca.

Los vídeos tienen controles propios de reproducción, pausa, avance, volumen, silencio y velocidad. Pantalla completa y ventana flotante dependen de lo que admita el navegador. No hay autoplay. Cerrar el visor o cambiar de archivo detiene el vídeo. Algunos MOV requieren códecs que no están presentes en todos los navegadores; el reproductor informa del error y permite descargar el original.

Las actualizaciones del autor se despliegan debajo de su propia publicación, con fecha, insignia de autor y adjuntos. El contador junto a la fecha abre el mismo hilo; comentarios y novedades se alternan sin duplicar la publicación. El contador usa agregaciones autorizadas por Firestore, solo se consulta para tarjetas visibles y se revisa cada 65 segundos con la página visible; el hilo abierto recibe cambios en tiempo real. Se muestran las 100 novedades más recientes, ordenadas cronológicamente, y el contador refleja el total.

El autor dispone de un botón «Añadir fotos», miniaturas, contador de selección y retirada individual. Se admiten hasta cuatro fotos JPG, PNG o WebP de 5 MB por archivo. Puede publicar solo fotos, texto con fotos o texto de 10 a 1000 caracteres sin adjuntos; con fotos, el texto es opcional y tiene un máximo de 1000 caracteres. Los visitantes ven el seguimiento sin formulario de publicación. Al ampliar una foto se conserva el borrador y el hilo permanece abierto debajo del visor. Las notificaciones remotas actualizan solo la lista, conservando los archivos seleccionados y el formulario incluso durante el envío.

## Datos y permisos

- Firestore: `reports/{reportId}/updates/{updateId}`, con los campos anteriores y `media` opcional.
- Realtime Database: `evidenceUpdates/{uid}/{reportId}/{updateId}/files/{slot}`; cada actualización dispone de las posiciones 0–3.
- Visibilidad: `evidenceVisibility/{uid}/{reportId}` y el bloqueo común `blockedEvidence/{reportId}`. Retirar el reporte también bloquea las fotos de sus actualizaciones para el público.
- Solo el autor de una publicación aprobada puede añadir actualizaciones. Las reglas validan campos, propietario, MIME, tamaño y cantidad.
- El mantenimiento elimina también la carpeta de fotos de actualizaciones al retirar definitivamente la publicación.

Las descargas simultáneas de una miniatura y del visor se comparten. La caché de URLs tiene límites de 24 archivos y 48 MiB, se libera al cerrar sesión y no se repuebla con descargas antiguas que terminen después. En producción no se utilizan URLs locales aportadas por metadatos de documentos antiguos.

## Comprobaciones

`qa/test_media.py` prueba vídeo WebM real, controles, carrusel, teclado, fotos de actualizaciones y borradores en 320, 390 y 1440 px. Requiere FFmpeg, Pillow, Playwright y Chromium, más la compilación servida en el puerto 5000.

`qa/test_media_adapter.mjs` verifica concurrencia de descargas, tratamiento de URLs antiguas y liberación de caché. Las pruebas de reglas cubren cuatro fotos válidas, suplantación de autor, cinco adjuntos, vídeos no admitidos en actualizaciones, tamaño excesivo y bloqueo por moderación.

## Acciones de cada funa

Las acciones tienen una distribución uniforme y estado activo para comentarios y actualizaciones. Compartir abre una tarjeta con el enlace directo, botón para copiar y opciones nativas cuando están disponibles; cancelar no envía nada. Reportar muestra el contexto de la funa y bloquea envíos duplicados mientras espera respuesta.

Los botones del reproductor usan SVG alineados al centro. La miniatura de vídeo agrupa el icono y el rótulo en un mismo bloque centrado, sin padding que desplace la figura. `qa/test_inline_updates.py` comprueba la geometría a 320, 390, 768 y 1440 píxeles, los hilos por publicación, el selector real de fotos, las miniaturas, la publicación sin texto, el lector, compartir y reportar.
