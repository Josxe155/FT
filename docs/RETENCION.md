# 🧹 Retención y limpieza de Funados Todos

## Estado de esta entrega

El registro de actividad y la renovación de sesión se publican en la web. El motor de limpieza está implementado y tiene pruebas aisladas. **La ejecución automática permanece desactivada** en `.github/workflows/maintenance.yml` hasta autorizar y configurar su identidad de Google Cloud.

La revisión automática de permisos rechazó crear una cuenta de servicio, un rol con permisos de borrado y un vínculo Workload Identity sin autorización explícita. El alcance propuesto puede revisarse en [google-access-plan.json](../maintenance/google-access-plan.json). No se activó facturación ni se guardaron credenciales privadas en GitHub.

## Política elegida

| Dato | Condición | Acción |
| --- | --- | --- |
| Publicación | Al menos 30 días desde su creación y **cero Me gusta** en el momento de revisarla. | Se elimina el documento, sus subcolecciones, reportes de moderación asociados y evidencias. |
| Publicación con apoyo | Uno o más Me gusta, aunque sea antigua. | Se conserva. «Sorprende» y «Preocupa» no cuentan como apoyo. |
| Cuenta normal | Al menos 30 días sin inicio de sesión ni actividad registrada. | Se elimina de Firebase Authentication y se borran perfil, preferencias, presencia, visita y actividad. |
| Administración | Correo protegido o claim `admin`/`retentionProtected`. | No se elimina por inactividad. |
| Cuentas existentes | No había medición fiable antes de esta entrega. | Tienen al menos 30 días desde la **primera ejecución activa** del mantenimiento. |

El plazo de publicaciones mide su edad; no son 30 días desde que pierde un Me gusta. Una publicación antigua que quede sin apoyo se elimina en la siguiente ejecución.

**Eliminar la cuenta no equivale a cerrar sesión.** Al volver, Google o invitado crean una nueva identidad Firebase si la anterior se eliminó; se pierden las preferencias y la autoría operativa del UID anterior. Las publicaciones con apoyo y sus evidencias se conservan, al igual que comentarios y votos que pertenecen a publicaciones conservadas. Esta decisión mantiene coherentes sus recuentos. Las sesiones invitadas eliminadas no son recuperables.

Firebase invalida las renovaciones de una cuenta eliminada. Un ID token ya emitido puede seguir siendo válido hasta su vencimiento, normalmente una hora. La web fuerza una renovación antes de publicar y cierra la sesión ante credenciales caducadas o cuentas eliminadas.

## Medición de actividad

`activity/{uid}/lastActiveAt` se guarda en Realtime Database con hora del servidor. Solo la cuenta correspondiente puede escribirlo; no puede cambiar el registro de otra ni enviar una fecha inventada. No contiene correos, títulos ni archivos.

La web registra al entrar, regresar a una pestaña visible o interactuar. Agrupa las escrituras a un máximo aproximado de una cada quince minutos por pestaña. Una pestaña que permanece abierta sin interacción no mantiene una cuenta activa indefinidamente. El proceso usa el valor más reciente entre creación, último inicio de sesión, actividad y el margen de despliegue.

## Ejecución prevista sin activar Blaze

GitHub Actions ejecutaría el proceso diariamente a las **05:23 UTC**, fuera del navegador del administrador. No depende de que una persona tenga abierto el panel. Los horarios de GitHub pueden retrasarse; no se garantiza eliminación al segundo exacto de cumplir 30 días. En repositorios públicos, GitHub puede desactivar tareas programadas después de 60 días sin actividad del repositorio; revisa Actions y sus avisos para mantener la tarea habilitada.

Se propone OIDC/Workload Identity Federation: GitHub recibe credenciales temporales solo para este repositorio, su rama `main` y el archivo concreto del workflow. No se almacena una clave de cuenta de servicio. El rol no incluye facturación ni administración del proyecto, pero tiene permisos sensibles de lectura, escritura y borrado sobre sus datos y usuarios. IAM no restringe esos permisos a documentos individuales; el código probado aplica la política.

Para activar tras la aprobación: crear la identidad y su vínculo con el alcance de `google-access-plan.json`, comprobar un `dry-run` autenticado y cambiar el bloqueo `if: false` del workflow por `if: true`. El primer push de activación ejecuta solo una simulación. Las ejecuciones programadas usarían `apply`; la ejecución manual permite elegir el modo y empieza por `dry-run`.

## Integridad y reintentos

- Se comprueba tanto el contador como la existencia de votos «Me gusta». Una discrepancia conserva la publicación.
- Una transacción vuelve a comprobar la publicación y bloquea nuevas interacciones al marcarla como `deleting`.
- Se bloquean y borran archivos, se retiran reportes asociados y se eliminan recursivamente comentarios, actualizaciones y reacciones.
- Los trabajos pendientes sobreviven a fallos parciales para retomarse en otra ejecución, incluso si falta el documento padre.
- El proceso vuelve a comprobar la actividad antes de eliminar cada cuenta.
- Hay un bloqueo de ejecución, topes de 100 publicaciones y 100 cuentas por ejecución, paginación y límites de exploración. Una cola grande puede necesitar varios días.
- Una simulación no modifica datos ni inicializa el margen. El borrado activo requiere `--apply` y habilitación explícita para producción.

## Comandos y pruebas

```sh
npm ci --prefix maintenance
npm test --prefix maintenance
npx -y firebase-tools@latest emulators:exec --only auth,firestore,database --project demo-funados-security 'node maintenance/test/integration.mjs && node qa/test_rules.mjs'
```

Las pruebas incluyen apoyo, antigüedad, actividad reciente, administrador, margen inicial, subcolecciones, evidencias, archivos que deben conservarse, simulación, reintento y ejecución repetida. El proyecto `demo-` impide usar accidentalmente los servicios de producción.

La carpeta `maintenance/` y sus dependencias **no se incluyen en Hosting**. Solo se publica `web/`. El mantenimiento consume cuotas de lecturas, escrituras y eliminaciones; automatizarlo no hace que Firebase sea ilimitado. Borrar usuarios de Authentication libera principalmente perfiles y preferencias pequeños; el mayor ahorro llega de eliminar evidencias de publicaciones caducadas.
