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
