/** Comprobaciones locales de requisitos antes de desplegar. Sin acceso remoto. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const config=readFileSync(resolve(root,'config.js'),'utf8');
const firebase=JSON.parse(readFileSync(resolve(root,'firebase.json'),'utf8'));
const issues=[];
const project='funados-todos';
const databaseURL=config.match(/"databaseURL"\s*:\s*"([^"]*)"/)?.[1]||'';
if(!databaseURL)issues.push('Falta databaseURL en config.js (Realtime Database).');
else if(!/^https:\/\/[\w.-]+\.(?:firebasedatabase\.app|firebaseio\.com)\/?$/.test(databaseURL))issues.push('databaseURL no parece ser una URL válida de Firebase RTDB.');
if(!config.includes('"projectId": "'+project+'"'))issues.push('projectId no coincide con '+project+'.');
if(firebase.hosting?.public!=='web')issues.push('Hosting no apunta a web/.');
if(firebase.functions)issues.push('firebase.json no debe declarar Cloud Functions en modo Spark.');
if(!existsSync(resolve(root,'web/dashboard.html')))issues.push('No existe web/dashboard.html.');
if(!existsSync(resolve(root,'web/assets/main.js')))issues.push('No se generó el JavaScript de la web.');
console.log('Preflight Funados Todos V15');
if(issues.length){for(const i of issues)console.error('FALTA:',i);process.exitCode=1;}
else console.log('Aprobado a nivel local. Aún faltan pruebas de reglas, autenticación y despliegue real.');
