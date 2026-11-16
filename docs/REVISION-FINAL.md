# Revisión final de Funados Todos

## Cambios funcionales

- Contenido sensible aplicado solo a imágenes y vídeos, incluidas las fotos de las actualizaciones. Título, descripción, comentarios y reacciones visibles. No se cargan miniaturas cubiertas hasta revelar los archivos.
- Control deshabilitado sin adjuntos; quitar todos los archivos lo desmarca. El cliente y Firestore impiden crear una publicación de solo texto marcada sensible. Los registros antiguos sin archivos se presentan sin cubierta.
- Etiqueta del formulario principal: «Comentar».
- Las escuchas de reacciones esperan la confirmación del servidor al crear un comentario, evitando permisos denegados para un documento todavía no guardado.
- Al guardar comentarios y respuestas se limpia el campo visible, aunque una notificación remota haya sustituido el formulario original. La operación pendiente conserva el bloqueo de envío y evita duplicados; un fallo conserva el borrador.
- Resto de textos de las secciones conservados. La explicación del control sensible se ajustó al nuevo comportamiento.

## Alcance verificado

- Acceso: opciones Google e invitado, apodo y cierre de sesión.
- Inicio: búsqueda, navegación y los 14 cantones disponibles. El proyecto organiza el contenido por cantones de El Oro; no contiene un catálogo adicional de provincias.
- Ajustes: apodo, preferencias y acceso a Mis funas. TikTok: vinculación, enlace de perfil y eliminación propia.
- Publicaciones: creación, reacciones, comentarios, respuestas, edición, eliminación propia, denuncias y actualizaciones.
- Multimedia: carruseles, visor, reproducción de vídeo, descarga segura y borradores.
- Dashboard: acceso restringido, paginación, búsqueda, detalles, evidencias, cancelar moderación, revisar, retirar, republicar y bloquear/desbloquear archivos. Limpieza manual: selección, cancelación, verificación de actividad reciente, protección del administrador, cascada y reintento.
- Las pruebas de escritorio y móvil usan datos ficticios. Las pruebas destructivas de moderación y mantenimiento se ejecutan con servicios simulados o emuladores.

## Firebase

Authentication no utiliza reglas de documentos: se revisó su configuración remota. Google e invitados están habilitados y `funados-todos.web.app` está autorizado. El acceso administrativo exige correo administrador verificado en el token. No se hizo una nueva autorización interactiva con la cuenta personal del propietario.

Firestore: pruebas de lectura sin sesión, suplantación de autor, alteración de autor/estado/fecha/título, omisión de campos, perfiles ajenos, metadatos, diez archivos válidos, imágenes mayores de 5 MiB, denuncias de más de 500 caracteres y actualizaciones de otro autor. Se exige adjuntar multimedia para crear una publicación sensible.

Realtime Database: propiedad de archivos, metadatos acotados, bloqueo por moderación, visibilidad, fotos de actualizaciones, actividad propia y acceso administrativo. La primera visita usa hora del servidor. No se modificó la facturación ni se añadió vencimiento temporal a las reglas.

Las reglas se validan en emuladores y con `deploy --dry-run`. El resultado de auditoría y los límites pendientes se documentan en [AUDITORIA-FINAL.json](AUDITORIA-FINAL.json) y [SEGURIDAD.md](SEGURIDAD.md).

## Pruebas reproducibles

Con la compilación servida en `http://127.0.0.1:5000`:

```sh
npm run check --prefix source
npm run build --prefix source
python qa/test_sensitive.py
python qa/test_ui.py
python qa/test_routes.py
python qa/test_extra.py
python qa/test_v15.py
python qa/test_media.py
python qa/test_dashboard.py
node qa/test_media_adapter.mjs
npm test --prefix maintenance
npx -y firebase-tools@latest emulators:exec --only auth,firestore,database --project demo-funados-security 'node maintenance/test/integration.mjs && node qa/test_rules.mjs'
```

Los resultados observados están en `qa/RESULTADOS.txt`. Las advertencias de permiso denegado de las pruebas negativas son esperadas.

## Seguimiento integrado y acciones

Las novedades se abren en una página propia con tarjetas como las de las funas, al tocar la publicación o el número junto al autor y la fecha. Se retiró el botón inferior de Actualizaciones y el acordeón. No se repite la publicación original en el listado de novedades. El autor puede añadir hasta cuatro fotos con miniaturas y retirada individual, incluso sin texto; los lectores ven las novedades sin formulario. Los cambios remotos conservan el borrador, los archivos y el bloqueo de envío. Los comentarios permanecen en la funa original y el seguimiento tiene su ruta propia con vuelta a la publicación, historial y recarga directa.

Compartir muestra el enlace directo con copia y opciones nativas; Reportar incluye el contexto y evita envíos duplicados. Los botones y el texto de la miniatura de vídeo forman un grupo centrado; los controles del reproductor usan SVG y se comprueban geométricamente en móvil y escritorio. Se añadieron pruebas de las consultas agregadas del contador y de las fotos sin texto, manteniendo los permisos de propietario y límites existentes.

## Contador de comentarios

Cada funa muestra un contador junto a Comentarios, incluidas las respuestas aprobadas. La agregación de Firestore usa `status == approved`, sin el límite de 200 elementos del listado. El hilo abierto sincroniza el contador con las notificaciones confirmadas del servidor; publicar y eliminar fuerzan la revisión del total. Las tarjetas visibles lo revisan periódicamente. La caché y las solicitudes pendientes se limpian al cambiar de sesión; los fallos de carga no se presentan como cero. No se amplían los permisos de las reglas.

## Seis reacciones, burbuja y usuarios privados

El total de novedades está a la derecha de Volver a la funa, en la misma fila. El total de comentarios se dibuja dentro de una burbuja de chat. Las seis reacciones se distribuyen en una fila en escritorio y en dos filas en móvil; los comentarios mantienen un formato compacto y accesible.

Los resúmenes anteriores de tres reacciones siguen leyéndose con cero para los campos nuevos ausentes. Las transacciones escriben seis totales y las reglas verifican cada variación junto al voto privado de su propietario. La limpieza, tanto manual como el ejemplo de mantenimiento desactivado, conserva publicaciones con cualquiera de las seis reacciones, aunque los metadatos antiguos no incluyan los campos nuevos.

Usuarios es una sección exclusiva del dashboard. Firebase Auth aporta los nombres de Google y userPrefs aporta los apodos de invitados. La consulta paginada de Auth y la lectura por lotes de los apodos se hacen con OAuth temporal de la cuenta propietaria; el token y los resultados permanecen en memoria y se eliminan al salir. La autorización de este directorio no ejecuta limpieza ni cambia datos. Las reglas de lectura pública no se amplían. Las cuentas sin apodo guardado se identifican como Invitado sin apodo, sin inventar un nombre.

## Reacciones compactas

Los botones muestran solo emoji y contador a la derecha, sin texto visible. El corazón se sustituye por 🤢 en publicaciones y comentarios. Se conserva el identificador de almacenamiento anterior para no perder votos ni modificar reglas; la etiqueta accesible pasa a Me da asco.

## Cierre de revisión

Los emojis de reacción se normalizan a 18 px, con botones de altura suficiente para pulsarlos y el contador a la derecha. La burbuja de comentarios también reduce su tamaño.

La revisión confirmó y corrigió un borrador que podía pasar al hilo de otra publicación al abrir sus comentarios. Ahora solo se restaura si pertenece a la misma funa. También se conserva el texto, el foco y el cursor de búsqueda/apodo ante actualizaciones de pantalla; el apodo se restaura únicamente para la misma cuenta y ruta. Las regresiones se prueban a 320, 390 y 1440 px.

Se ejecutaron las pruebas de todas las secciones: acceso, 14 cantones, ajustes, Mis funas, TikTok, comentarios, respuestas, denuncias, actualizaciones, reacciones, sensibilidad, carruseles, reproducción y descarga, dashboard, directorio privado, moderación, mantenimiento y reglas de Firebase en emuladores. Google e invitados permanecen habilitados y el dominio publicado está autorizado. Los resultados detallados y las limitaciones externas observadas permanecen documentados en `qa/RESULTADOS.txt`.

## Prioridad al contenido multimedia

Las reacciones pasan a una tira compacta de tamaño natural, sin tarjetas ni contadores en cápsulas. Los emojis miden 14 px y los botones reducen su altura a 30 px. El fondo es transparente salvo al señalar o seleccionar una reacción. La tira se adapta al espacio disponible para dar protagonismo a las imágenes y vídeos.

## Reacciones adaptables y alineadas a la derecha

Los emojis de publicaciones crecen de 18 a 26 px según la pantalla; en comentarios, de 16 a 22 px. Los botones aprovechan el ancho disponible y la fila se alinea a la derecha, permitiendo varias líneas si hace falta. Se mantienen el contador a la derecha, las etiquetas accesibles y los estados de selección. Verificado a 320, 390, 768 y 1440 px.

## Operación administrada — 16/11/2026

Se incorpora límite de tres funas por cuenta y hora, atómico entre publicación y contador privado, sin excepción para Google o invitados. El contador no puede borrarse ni reiniciarse antes de tiempo desde el cliente. El administrador mantiene la limpieza manual. Se retiran descargas del visor, dashboard y mensajes del reproductor. Atahualpa y Portovelo usan ilustraciones locales originales para eliminar las solicitudes de imágenes que devolvían 503.
