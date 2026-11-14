# ⚖️ Funados Todos

> Plataforma comunitaria para compartir reportes locales de forma anónima y responsable en los cantones de El Oro, Ecuador.

[![Firebase Hosting](https://img.shields.io/badge/Firebase-Hosting-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/products/hosting)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Estado](https://img.shields.io/badge/estado-en%20desarrollo-5b6cff)](#-estado-del-proyecto)

## ✨ Características

- 🗺️ Explora los 14 cantones de El Oro y sus publicaciones.
- 🕵️ Accede con Google o como invitado; los autores se muestran como anónimos.
- 💬 Crea comentarios, respuestas, ediciones y eliminaciones propias.
- 👍 Reacciona a publicaciones y comentarios.
- 🚩 Reporta contenido; el motivo **Otro** requiere explicación.
- 🖼️ Adjunta evidencias de imagen o video mediante Realtime Database.
- 🎵 Enlaza voluntariamente un perfil de TikTok.
- 🛡️ Incluye reglas para Firestore y Realtime Database, más cabeceras de seguridad para Hosting.

## 🧰 Tecnologías

| Área | Tecnología |
| --- | --- |
| Interfaz | TypeScript, Vite y CSS responsivo |
| Autenticación | Firebase Authentication (Google / anónimo) |
| Datos | Cloud Firestore y Firebase Realtime Database |
| Hosting | Firebase Hosting |

## 🚀 Desarrollo local

Requisitos: Node.js 22+, npm y una configuración válida de Firebase en `config.js`.

```bash
cd source
npm ci
npm run check
npm run build
cd ..
node scripts/preflight.mjs
```

Para una vista estática, sirve la carpeta raíz con tu servidor local preferido. Para probar integración real, usa Firebase Emulator Suite y no datos personales.

## ☁️ Despliegue

1. Crea o selecciona el proyecto Firebase `funados-todos`.
2. Activa Authentication (Google y Anónimo), Firestore y Realtime Database.
3. Instala e inicia sesión en Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use funados-todos
firebase deploy --only firestore:rules,firestore:indexes,database,hosting
```

La dirección esperada es `https://funados-todos.web.app/` y el panel está en `/dashboard.html`.

> ⚠️ Este repositorio **no contiene Cloud Functions**. No ejecutes un despliegue de `functions` ni afirmes que existen automatizaciones de backend hasta que dichas funciones se añadan, prueben y desplieguen por separado.

## 🛡️ Seguridad y uso responsable

- Nunca subas claves de servicio, contraseñas, tokens ni archivos `.env`.
- La configuración web de Firebase es pública por diseño; el control de acceso depende de Authentication y las reglas.
- Antes de publicar con personas reales, prueba las reglas con Emulator Suite, activa App Check y define un proceso de moderación, retirada de contenido y respuesta a abusos.
- Una etiqueta de contenido sensible es un aviso visual; no sustituye reglas de acceso estrictas.
- Evita publicar datos identificativos, amenazas o acusaciones no verificadas. La persona que publica es responsable del contenido y de cumplir la normativa aplicable.

## 📁 Estructura

```text
source/       Código fuente TypeScript y proceso de compilación
web/          Archivos publicados por Firebase Hosting
assets/       Copia estática para desarrollo local
scripts/      Preflight y sincronización de la compilación
qa/           Comprobaciones locales reproducibles
```

## ✅ Estado del proyecto

La comprobación de tipos, la compilación y el preflight se ejecutan localmente. Aún debes validar manualmente Authentication, reglas, permisos y operaciones de datos en Emulator Suite y en el proyecto Firebase autorizado antes de una apertura pública.

---

Hecho con cuidado para la comunidad de El Oro. 🇪🇨
