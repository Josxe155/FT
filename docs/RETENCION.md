# 🧹 Limpieza manual y retención

## Uso actual

La limpieza se ejecuta desde **Dashboard → Limpieza manual**, con la cuenta administradora. No depende de una tarea programada ni de que se cree una identidad IAM nueva.

1. Pulsa **Autorizar revisión con Google** y acepta los permisos adicionales de Firebase para tu propia cuenta propietaria.
2. Consulta las dos listas: publicaciones candidatas y cuentas inactivas.
3. Usa **Actualizar revisión** para empezar de nuevo o **Revisar siguientes páginas** para continuar. Se revisan 100 publicaciones antiguas y hasta 1000 cuentas por página; la pantalla distingue una revisión parcial de una completa.
4. Las cuentas antiguas en margen inicial aparecen para consulta, pero su casilla permanece desactivada. Selecciona hasta 100 elementos elegibles de cada tipo. La revisión y la selección no borran nada.
5. Pulsa **Eliminar selección** y confirma. El resultado indica eliminaciones, elementos conservados y errores.
6. Si hubo un fallo parcial, **Reanudar pendientes** continúa los trabajos registrados sin repetir borrados ya terminados.

Los recuentos del dashboard se consultan en el servidor. Sus listas normales tienen paginación, búsqueda sobre los registros cargados y actualización cada minuto mientras la pestaña está visible y no se está trabajando sobre el filtro o el detalle. La revisión de limpieza solo se refresca con sus botones; siempre se vuelve a comprobar cada elemento antes de eliminarlo.

## Criterio vigente

| Dato | Condición | Resultado |
| --- | --- | --- |
| Publicación | Al menos 30 días desde su creación, cero Me gusta, cero Sorprende, cero Preocupa y ningún comentario. | Puede seleccionarse para borrar. |
| Publicación con participación | Tiene cualquier reacción o comentario, aunque sea antigua. | Se conserva. |
| Cuenta normal | 30 días sin inicio de sesión ni actividad registrada. | Puede seleccionarse para borrar de Firebase Authentication. |
| Administración | Correo administrador o claim `admin` / `retentionProtected`. | Siempre se conserva. |
| Cuentas anteriores a la medición | No había registro fiable de actividad. | Margen mínimo de 30 días desde la inicialización del control de mantenimiento. |

Este criterio sustituye al anterior de «cero Me gusta». Se consulta tanto el resumen de reacciones como la existencia de votos y comentarios reales. Una discrepancia preserva la publicación.

El plazo mide la edad de la publicación, no 30 días continuos sin reacciones. Las actualizaciones del autor no reinician esa antigüedad. Una publicación antigua que se quede sin participación puede ser candidata al actualizar la revisión.

## Qué se borra y qué se conserva

Al borrar una publicación se retiran sus documentos, comentarios y descendientes huérfanos, actualizaciones, reacciones, reportes asociados, evidencias originales y fotos de actualizaciones. Un trabajo de mantenimiento separado permite retomar un fallo aunque haya desaparecido el documento padre.

Al eliminar una cuenta se borran su registro de **Firebase Authentication**, perfil, preferencias, presencia, visita y actividad. Se conservan las publicaciones con participación y sus archivos; también los comentarios y votos de publicaciones conservadas, para mantener coherentes sus recuentos.

**No se elimina la cuenta personal de Google.** Si la cuenta Firebase anterior se eliminó, al regresar con Google o invitado se creará una identidad nueva. No recuperará la autoría operativa ni las preferencias del UID anterior. Las sesiones invitadas eliminadas no son recuperables.

Un ID token ya emitido puede seguir siendo válido hasta su vencimiento, normalmente una hora. La web fuerza una renovación antes de publicar y regresa al acceso si la cuenta se eliminó o sus credenciales caducaron.

## Autorización y seguridad

El acceso normal al dashboard requiere correo administrador verificado en Firebase. Para listar y borrar cuentas de Authentication hace falta además autorización OAuth de la cuenta que **ya tiene permisos de administración en el proyecto de Google Cloud/Firebase**. Un ID token del cliente no concede por sí solo esos permisos.

El botón solicita los ámbitos OAuth `datastore`, `firebase`, `firebase.database` y `userinfo.email`, además de la identidad habitual del acceso con Google. Se usa `reauthenticateWithPopup`, para impedir autorizar por error otra cuenta distinta de la que tiene abierto el panel. Las APIs de Google comprueban los permisos reales de esa cuenta en cada solicitud.

El token se conserva solo en memoria, no en localStorage, archivos de Hosting, GitHub ni registros. La aplicación pide renovar la autorización después de unos 50 minutos o si Google la rechaza. Al cerrar sesión se pierde el acceso del módulo. Google puede mostrar un consentimiento adicional o exigir requisitos de verificación de su aplicación OAuth; no debe omitirse ese consentimiento ni introducir credenciales privadas en el navegador.

No se creó una cuenta de servicio ni se concedieron roles IAM persistentes. El workflow automático previo permanece desactivado como ejemplo; su plan IAM es una alternativa histórica y no es necesario para el panel manual. No se activó facturación.

## Actividad y consistencia

`activity/{uid}/lastActiveAt` se escribe con hora del servidor. Cada usuario solo puede registrar su propia actividad, sin inventar una fecha ni modificar cuentas ajenas. La cuenta administradora verificada puede consultar los registros de actividad para esta revisión.

La web agrupa actividad de pestañas visibles e interacción reciente a un máximo aproximado de una escritura cada quince minutos por pestaña. Una pestaña abandonada no mantiene activa indefinidamente la cuenta.

El mantenimiento toma un bloqueo para evitar ejecuciones simultáneas y lo renueva mientras trabaja. La publicación se vuelve a comprobar dentro de una transacción y pasa a `deleting`, estado que impide nuevas reacciones y comentarios. Los archivos se bloquean antes del borrado. Una nueva actividad o reacción detectada antes de confirmar la eliminación conserva el elemento. No existe una transacción común entre Authentication, Firestore y RTDB; se minimiza esa ventana con una segunda lectura y trabajos reanudables.

No cierres la pestaña durante el proceso. Si la autorización o la conexión caduca, los trabajos incompletos quedan pendientes. Un bloqueo interrumpido de otra pestaña expira en 30 minutos. No se garantiza disponibilidad ilimitada: la revisión y el borrado consumen cuotas de Firebase. El mayor ahorro procede de los archivos, no de los pequeños registros de Authentication.

## Pruebas

```sh
npm ci --prefix maintenance
npm ci --prefix qa
npm test --prefix maintenance
npx -y firebase-tools@latest emulators:exec --only auth,firestore,database --project demo-funados-security 'node maintenance/test/integration.mjs && node qa/test_rules.mjs'
python -m http.server 5000 --bind 127.0.0.1 --directory web
# En otra terminal, con Playwright y Chromium:
python qa/test_dashboard.py
python qa/test_media.py
node qa/test_media_adapter.mjs
```

`test_dashboard.py` utiliza servicios y tokens ficticios; comprueba búsqueda, paginación, selección, cancelación, datos que cambiaron después de revisar, borrado en cascada y reanudación. Los emuladores comprueban permisos reales de las reglas y la lógica de retención. Se probó también el flujo de APIs reales con una publicación privada creada solo para QA, sin eliminar cuentas reales. El consentimiento interactivo de Google debe completarlo la persona administradora desde el panel.
