<div align="center">

<img src="source/public/assets/logo.svg" alt="Logotipo de Funados Todos" width="112" height="112" />

# Funados Todos

**La voz de tu comunidad, en un solo lugar.**

Reportes locales, conversaciones y evidencias de los 14 cantones de El Oro.<br />
Una experiencia para celular, tablet y computadora.

[![Web](https://img.shields.io/badge/WEB-ABRIR%20FUNADOS-ED5371?style=for-the-badge&logo=firebase&logoColor=white)](https://funados-todos.web.app/)
[![TypeScript](https://img.shields.io/badge/TYPESCRIPT-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](source/package.json)
[![Firebase](https://img.shields.io/badge/FIREBASE-HOSTING%20%2B%20DATOS-FFCA28?style=for-the-badge&logo=firebase&logoColor=20232A)](firebase.json)
[![Acceso](https://img.shields.io/badge/ACCESO-GOOGLE%20%2B%20INVITADO-648BC4?style=for-the-badge&logo=google&logoColor=white)](#-acceso-y-privacidad)

[Ver la web](https://funados-todos.web.app/) · [Inicio rápido](#-inicio-rápido) · [Configuración](#-configuración) · [Seguridad](docs/SEGURIDAD.md)

</div>

---

## ✨ El proyecto

Funados Todos reúne reportes de la comunidad de **El Oro, Ecuador**, con evidencias, comentarios y herramientas de moderación. El logotipo representa un megáfono sobre azul medianoche, con acentos coral y marfil.

| 📍 Tu cantón | 📣 Publicaciones | 💬 Conversaciones |
| :--- | :--- | :--- |
| Explora los 14 cantones y sus reportes. | Título, descripción y hasta diez evidencias. | Comentarios, respuestas, edición y eliminación propias. |

| 🖼️ Evidencias | 🛡️ Moderación | 🎵 Identidad opcional |
| :--- | :--- | :--- |
| Imágenes hasta 5 MB y videos hasta 10 MB por archivo. | Reportes por motivo y panel privado de administración. | Puedes enlazar voluntariamente tu cuenta de TikTok. |

## 🔑 Acceso y privacidad

- **Google:** acceso mediante una cuenta de Google.
- **Invitado:** sesión anónima de Firebase y apodo local. No es una cuenta recuperable mediante contraseña.
- Los autores se muestran como **Anónimo**, salvo que vinculen TikTok. Firebase conserva el UID del autor; no se promete anonimato frente al operador del servicio.
- **Contenido sensible:** oculta solo imágenes y vídeos hasta pulsar «Ver contenido»; título, descripción, comentarios y reacciones siguen visibles. Solo se activa al adjuntar archivos. «Ocultar contenido» vuelve a cubrir los archivos. Es un control visual, no una barrera de permisos.
- El panel [`/dashboard.html`](https://funados-todos.web.app/dashboard.html) requiere la cuenta administradora verificada y permisos comprobados por Firebase.

## 🧩 Tecnología

| Capa | Tecnología | Función |
| :--- | :--- | :--- |
| Interfaz | TypeScript · CSS | Navegación y componentes del navegador. |
| Herramientas | TypeScript · Vite | Tipos y desarrollo local. El build vigente emite módulos con `tsc`. |
| Acceso | Firebase Authentication | Google e invitado. |
| Publicaciones | Cloud Firestore | Reportes, comentarios, reacciones y perfiles. |
| Archivos | Realtime Database | Evidencias divididas en bloques; Firestore guarda metadatos. |
| Publicación | Firebase Hosting | Web estática mediante HTTPS. |

No hay Cloud Functions en este repositorio. Los reportes no disparan por sí solos una retirada automática: la moderación cambia el estado desde el panel.

## 🚀 Inicio rápido

**Requisitos:** Node.js 22 o posterior, npm y Git.

```sh
git clone https://github.com/Josxe155/Funados-Todos.git
cd Funados-Todos/source
npm ci
npm run check
npm run build
cd ..
node scripts/preflight.mjs
npx -y firebase-tools@latest emulators:start --only hosting
```

Abre **http://localhost:5000**. Este comando solo emula Hosting: la configuración incluida sigue apuntando a los servicios reales de Firebase. Para pruebas de permisos usa un proyecto aislado o Emulator Suite con los SDK conectados explícitamente a sus emuladores.

## ⚙️ Configuración

| Archivo | Contenido | ¿Se versiona? |
| :--- | :--- | :---: |
| `config.js` | Identificadores públicos y API key web de Firebase. | Sí |
| `.firebaserc` · `firebase.json` | Proyecto, Hosting y servicios. | Sí |
| `firestore.rules` · `database.rules.json` | Permisos y validación de datos. | Sí |
| `firestore.indexes.json` | Índices de consultas. | Sí |
| Cuentas de servicio, tokens y contraseñas | Credenciales privadas; nunca en código ni en Hosting. | **No** |

<details>
<summary><strong>🔐 Aviso de GitHub: Google API Key</strong></summary>

GitHub detectó la clave web de Firebase en `web/config.js`. Firebase necesita esa configuración en el navegador y la clave es visible en la web publicada. No concede permisos administrativos: los datos dependen de Authentication y de las reglas.

Excluirla del README o moverla a un `.env` que se compila en el navegador no la convierte en secreta. Debe restringirse a los dominios y APIs necesarios. Esta revisión limita sus referentes a los dos dominios Firebase del proyecto y a los puertos locales 5000/5173; conserva las restricciones de APIs existentes para no romper servicios.

No se ha cerrado la alerta de GitHub ni se ha revocado la clave. Si la clave se utilizó también para servicios privados o hay indicios de abuso, corresponde sustituirla y revocarla después de verificar sus consumidores. Más detalle en [Seguridad](docs/SEGURIDAD.md).

</details>

<details>
<summary><strong>☁️ Producción, modo de prueba y los 30 días</strong></summary>

Las reglas de este repositorio no contienen un acceso global temporal ni una condición que expire después de 30 días. Requieren identidad, comprueban propiedad y rechazan rutas no autorizadas.

El modo de prueba de Firebase suele incluir una fecha de vencimiento en las reglas. Eso es distinto del plan gratuito Spark y de una promoción de Google Cloud. **Cambiar reglas no amplía promociones ni elimina cuotas.** La facturación estaba desactivada en la comprobación remota del 15 de noviembre de 2026; esta revisión no activa facturación ni cambia el plan.

Al llegar a una cuota gratuita pueden fallar lecturas, escrituras o descargas. Revisa Uso y cuotas en Firebase Console. Las reglas no sustituyen controles contra spam ni límites de tráfico.

</details>

## 🛠️ Comandos

| Comando | Acción |
| :--- | :--- |
| `npm ci --prefix source` | Instala dependencias. |
| `npm run check --prefix source` | Comprueba los tipos. |
| `npm run build --prefix source` | Genera `web/` y sincroniza recursos. |
| `node scripts/preflight.mjs` | Comprueba estructura y configuración local. |
| `python qa/test_ui.py 390` | Recorre la interfaz con Chromium y datos locales. |
| `python qa/test_sensitive.py` | Comprueba ocultación y revelado en cuatro anchos. |

Las pruebas Python necesitan Playwright, Pillow y Chromium; la prueba de vídeo también requiere FFmpeg. Las pruebas locales de interfaz no demuestran por sí solas que los permisos remotos sean correctos.

## ☁️ Publicar en Firebase

```sh
npm run check --prefix source
npm run build --prefix source
node scripts/preflight.mjs
npx -y firebase-tools@latest login
npx -y firebase-tools@latest deploy --only hosting,firestore:rules,firestore:indexes,database --project funados-todos
```

El directorio de Hosting es **`web/`**. Subir un commit a GitHub no publica automáticamente la web. Comprueba y prueba cambios de reglas antes de desplegarlos.

## 🎞️ Multimedia y actualizaciones

- **Carrusel de evidencias:** desliza, usa las flechas o el teclado; amplía una imagen y recorre los demás archivos desde el visor.
- **Reproductor propio:** reproducción/pausa, avance, volumen, silencio, velocidad, pantalla completa y ventana flotante cuando el navegador lo permita. No reproduce automáticamente.
- **Actualizaciones del autor:** mensajes fechados con hasta cuatro fotos de 5 MB cada una. El borrador se conserva al ampliar una imagen.
- **Visualización dentro de la página:** sin botones de descarga en el visor ni en el dashboard. Algunos MOV dependen de los códecs del navegador. Como cualquier contenido visible en la web, no se puede garantizar que nadie lo copie o capture.

## 🧹 Limpieza manual desde el dashboard

En **[Dashboard → Limpieza manual](https://funados-todos.web.app/dashboard.html)**:

1. Entra con la cuenta administradora y pulsa **Autorizar revisión con Google**.
2. Revisa publicaciones y cuentas; usa **Actualizar revisión** o continúa con las siguientes páginas.
3. Selecciona los elementos y pulsa **Eliminar selección**. Se pide confirmación antes del borrado.

La política vigente conserva cualquier publicación con reacciones **o comentarios**. Son candidatas las de al menos **30 días sin ninguna reacción ni comentario**. Las cuentas normales sin actividad durante 30 días también pueden seleccionarse; administración está protegida y las cuentas anteriores tienen margen inicial.

La autorización temporal utiliza los permisos que la cuenta propietaria ya tiene en Firebase. No hay claves privadas, cuentas de servicio nuevas ni cambios de facturación. El token de Google queda en memoria y se debe renovar cuando caduque. **El workflow automático anterior sigue desactivado y no es necesario para usar el botón.**

Eliminar una cuenta de Firebase no elimina su cuenta personal de Google. Al volver a esta web tendrá una identidad nueva. Consulta [política, permisos, pruebas y reanudación](docs/RETENCION.md).

## 📂 Estructura

```text
Funados-Todos/
├── source/src/            Interfaz y adaptador Firebase
├── source/public/assets/ Identidad visual y recursos originales
├── web/                  Archivos publicados en Hosting
├── assets/               Copia estática sincronizada
├── scripts/              Compilación y comprobaciones
├── maintenance/          Motor de retención y pruebas; fuera de Hosting
├── .github/workflows/    Ejemplo automático desactivado
├── qa/                   Pruebas y resultados
├── docs/                 Seguridad y mantenimiento
├── config.js             Configuración pública Firebase
├── firebase.json         Hosting y servicios
├── firestore.rules       Reglas Firestore
└── database.rules.json    Reglas Realtime Database
```

## 📚 Documentación y mantenimiento

| Guía | Contenido |
| :--- | :--- |
| [Galerías y vídeos](docs/MULTIMEDIA.md) | Reproductor, carrusel, actualizaciones con fotos y límites de formatos. |
| [Retención y limpieza](docs/RETENCION.md) | Botón manual, política de 30 días, permisos y pruebas. |
| [Seguridad y revisión](docs/SEGURIDAD.md) | API key, permisos, caducidad, límites y pruebas. |
| [Auditoría estructurada](docs/auditoria-reglas.json) | Hallazgos y alcance de la evaluación. |
| [Resultados](qa/RESULTADOS.txt) | Verificaciones de interfaz y pruebas reales anteriores. |
| [Fuentes de imágenes](FUENTES_IMAGENES.md) | Procedencia de las fotografías de cantones. |

---

<div align="center">

**Funados Todos** · Una voz para la comunidad de El Oro. 🇪🇨<br />
Comparte información responsable. Evita amenazas, datos privados y acusaciones no verificadas.

</div>

### Seguimiento de publicaciones

Tocar una funa o el número junto al autor y la fecha abre una página propia de actualizaciones, con tarjetas como el listado de funas. No hay botón inferior de Actualizaciones. El autor puede añadir texto y hasta cuatro fotos, incluso publicar solo imágenes. Los demás usuarios pueden leer y ampliar las fotos. Las acciones de comentarios, compartir y reportar tienen controles dedicados. Consulta [multimedia y seguimiento](docs/MULTIMEDIA.md) para límites y comprobaciones.

El contador junto a «Comentarios» incluye comentarios y respuestas aprobados. Se actualiza al publicar o eliminar, y carga el total sin limitarse a los comentarios visibles.

### Reacciones y administración

Las publicaciones y los comentarios admiten seis reacciones: Me gusta, Me sorprende, Me preocupa, Me enoja, Me entristece y Me da asco (🤢). Cada cuenta conserva una sola selección por publicación o comentario; tocarla otra vez la quita. Cualquiera de las seis protege la publicación en la limpieza manual.

En el dashboard, **Usuarios** muestra el nombre de las cuentas de Google y el apodo privado de los invitados. La consulta requiere autorización temporal de la cuenta administradora; los nombres no se guardan en perfiles públicos ni se muestran en la comunidad. El directorio permite buscar y cargar más usuarios.

Los botones de reacción muestran únicamente el emoji y su contador a la derecha. Los nombres se conservan como etiquetas accesibles para lectores de pantalla.

## ⏱️ Límite de publicaciones

Cada cuenta Google o invitada puede publicar **3 funas por ventana de una hora**, iniciada con la primera publicación confirmada. El contador privado `publishLimits/{uid}` y la funa se guardan en una transacción; las reglas rechazan una cuarta publicación, reinicios anticipados y escrituras sin contador. La aplicación informa del tiempo de espera y conserva el texto. Una subida fallida no consume cupo. La limpieza manual elimina también el contador cuando retira una cuenta inactiva.

El límite es por cuenta, no por persona ni dirección IP. Crear otra cuenta invitada puede eludir esa identidad; App Check y controles globales siguen siendo mejoras futuras. La aplicación se opera con administración y moderación continuas.

Prueba específica: `node qa/test_publish_limits.mjs`, dentro del emulador de Firestore.

## 👥 Administración de usuarios

En Dashboard → Usuarios, autoriza con la cuenta propietaria. Cada fila muestra nombre de Google o apodo de invitado, número de funas conservadas (todos los estados), estado de acceso y acciones con confirmación: **Bloquear**, **Desbloquear** y **Eliminar**. La cuenta administradora y las identidades marcadas como protegidas no admiten estas acciones.

El bloqueo deshabilita Authentication, revoca la sesión y añade marcadores privados en Firestore y RTDB para denegar también las solicitudes de tokens todavía vigentes. La eliminación retira la cuenta y los datos privados, y conserva sus publicaciones y comentarios para moderación. Si se interrumpe la limpieza tras eliminar Authentication, puede reanudarse desde Limpieza manual. No se elimina la cuenta personal de Google. Un invitado puede crear una identidad nueva.

Los tokens OAuth administrativos permanecen solo en memoria, con caducidad; las operaciones requieren permisos IAM del propietario y no se conceden a usuarios normales mediante reglas. Si falla un servicio, el panel informa del estado parcial y permite completar el bloqueo o desbloquear tras actualizar la lista.
