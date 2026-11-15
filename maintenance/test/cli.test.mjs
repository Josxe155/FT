import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../cleanup.mjs',import.meta.url));
function invoke(project,overrides={}){
 const env={...process.env,GCLOUD_PROJECT:project};
 for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST','RETENTION_APPLY_AUTHORIZED','NODE_TEST_CONTEXT'])delete env[name];
 return spawnSync(process.execPath,[script,'--apply'],{env:{...env,...overrides},encoding:'utf8',timeout:10000});
}
test('la CLI rechaza mezclas de entornos y borrado real no activado antes de conectarse',()=>{
 const demo=invoke('demo-accidental');assert.ifError(demo.error);assert.equal(demo.status,1);assert.match(demo.stderr,/all three emulators/);
 const production=invoke('funados-todos');assert.equal(production.status,1);assert.match(production.stderr,/explicit activation/);
 const mixed=invoke('funados-todos',{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8086'});assert.equal(mixed.status,1);assert.match(mixed.stderr,/mix production/);
});
