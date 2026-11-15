# 🔐 Seguridad de Funados Todos

Revisión del 15 de noviembre de 2026. Reglas destinadas a sustituir el acceso temporal del modo de prueba, con permisos por identidad y denegación por defecto. Son una base revisada y comprobada para este esquema; no una certificación de ausencia de vulnerabilidades.

## La alerta «Google API Key»

GitHub señaló `web/config.js:5` en un commit anterior. La configuración corresponde al SDK web de Firebase y se publica en el navegador. No es una cuenta de servicio ni contiene una clave privada. La revisión del árbol actual no encontró tokens privados ni bloques de claves privadas; eso no equivale a analizar exhaustivamente cada commit del historial.

Se verificaron y aplicaron restricciones HTTP de referentes a `funados-todos.web.app`, `funados-todos.firebaseapp.com` y los puertos locales 5000/5173. Se conservaron las restricciones de APIs existentes. Un referente restringido reduce reutilización desde otros sitios, pero no impide que un atacante imite solicitudes fuera del navegador. Authentication y las reglas siguen siendo obligatorios.

La alerta de GitHub no se ha cerrado ni se ha rotado la clave. Una configuración Firebase pública no debe presentarse como un secreto ocultable mediante `.env`: el resultado compilado vuelve a ser público. Si hay evidencia de abuso o se reutilizó esa clave para otros servicios sensibles, hay que crear una sustituta restringida, comprobar todos los clientes y revocar la anterior. No se debe revocar a ciegas una clave que sostiene el inicio de sesión.

## Los 30 días y la facturación

No hay una fecha de caducidad de modo de prueba en las reglas revisadas de Firestore ni Realtime Database. Las reglas no cambian el plan ni prolongan créditos de Google Cloud. La comprobación remota indicó **facturación desactivada**; no se activó una cuenta de facturación.

Las cuotas gratuitas siguen aplicándose. La subida fragmentada a Realtime Database produce múltiples operaciones y transfiere base64, con más bytes que el archivo original. La ausencia de vencimiento no garantiza disponibilidad ilimitada.

## Cambios de permisos

| Área | Protección |
| --- | --- |
| Rutas no declaradas | Denegadas por defecto. |
| Publicaciones | Autor autenticado, estado y campos acotados; no se permite cambiar autor ni estado desde una cuenta normal. |
| Archivos en Firestore | Metadatos con propietario, posición, MIME, tamaño y cantidad de bloques coherentes. No se admiten bytes ni URLs arbitrarias en `images` al crear documentos nuevos. |
| Evidencias en RTDB | Escritura por propietario, formatos y tamaños limitados, metadatos sin campos extra. |
| Visibilidad | Nuevos registros en `evidenceVisibility/{uid}/{reportId}`. Un propietario no puede reservar o activar la visibilidad de otro. |
| Evidencias anteriores | Lectura compatible con el registro antiguo solo si su `ownerUid` coincide con la ruta del archivo. No se admite crear nuevos registros con el formato antiguo. |
| Subidas fallidas | El propietario puede eliminar su carpeta de evidencias; no obtiene permiso para modificar archivos ajenos. |
| TikTok | Mismo validador al crear y actualizar; no se admite autoasignarse verificación ni nombres con formato inválido. |
| Administración | Correo administrador verificado en el token de Firebase; no se acepta un rol escrito por el navegador. |

## Pruebas reproducibles

```sh
npm install --prefix qa
npx -y firebase-tools@latest emulators:exec --only firestore,database --project demo-funados-security 'node qa/test_rules.mjs'
```

Se usa un proyecto **demo** sin datos reales. La batería comprueba publicación válida, lecturas sin sesión, suplantación de autor, cambios de estado no autorizados, metadatos maliciosos, exceso de tamaño, perfiles, lectura de evidencias, reserva de visibilidad ajena, limpieza propia y protección de visitas. Las versiones y el resultado observado se registran en `qa/RESULTADOS.txt`.

Antes de publicar las reglas también se comprueba su sintaxis con `deploy --dry-run`. Si se cambia el esquema de archivos o las consultas, hay que actualizar y repetir las pruebas.

## Riesgos que permanecen

- Una cuenta invitada puede crearse de nuevo. Los límites por documento no sustituyen límites de frecuencia ni evitan por sí solos spam, agotamiento de cuotas o descargas masivas.
- App Check no se ha activado ni se ha forzado desde esta revisión: exige configurar y probar el proveedor del sitio para evitar bloquear clientes legítimos.
- El MIME y el tamaño declarados no inspeccionan el contenido binario. No hay antivirus ni moderación automática de archivos.
- La etiqueta de contenido sensible oculta la interfaz; no retira los permisos de lectura del documento o del archivo aprobado.
- Los documentos públicos para usuarios autenticados incluyen el UID del autor. El nombre «Anónimo» no promete anonimato criptográfico ni impide correlación por UID.
- Las fotografías de cantones se cargan desde terceros y pueden fallar o cambiar. No afectan al permiso para publicar.
- La moderación de Firestore y el bloqueo de RTDB son dos operaciones en servicios distintos, sin una transacción común. Deben revisarse los errores del panel y la coherencia de ambos estados.
- Los bloques de RTDB tienen un número máximo de posiciones; la validación no inspecciona que los bytes formen una imagen o video real. El cliente comprueba integridad al reconstruirlos.

## Revisión de mantenimiento

Tras cada cambio de reglas: ejecutar emuladores, comprobar invitado y Google, publicar una prueba controlada con y sin imagen, retirarla, y revisar cuotas y errores. No subir tokens, cuentas de servicio ni contraseñas al repositorio.

## Retención implementada

Ver [RETENCION.md](RETENCION.md): registro de actividad protegido, política de cero Me gusta tras 30 días y limpieza de cuentas. La programación queda desactivada hasta aprobar su identidad y los permisos de borrado. No hay un nuevo backend Cloud Functions ni cambio de plan.
