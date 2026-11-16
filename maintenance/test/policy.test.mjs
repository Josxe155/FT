import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../policy.json' with {type:'json'};
import {DAY,shouldDeleteReport,shouldDeleteUser} from '../policy.mjs';
const now=Date.UTC(2026,10,15), old=now-31*DAY;
test('30 días exactos, cero reacciones ni comentarios; conservar participación',()=>{
 assert.equal(shouldDeleteReport({createdAt:now-30*DAY},{like:0,wow:0,concern:0},now,policy),true);
 assert.equal(shouldDeleteReport({createdAt:old},{like:0,wow:1,concern:0},now,policy),false);
 assert.equal(shouldDeleteReport({createdAt:old},{like:0,wow:0,concern:1},now,policy),false);
 assert.equal(shouldDeleteReport({createdAt:old},{like:0,wow:0,concern:0},now,policy,true),false);
 for(const kind of ['angry','sad','love'])assert.equal(shouldDeleteReport({createdAt:old},{like:0,wow:0,concern:0,[kind]:1},now,policy),false);
 assert.equal(shouldDeleteReport({createdAt:old},{like:0,wow:0,concern:0,angry:-1},now,policy),false);
 for(const [date,like] of [[now-30*DAY+1,0],[old,1],[old,-1],[old,NaN],[null,0]])
  assert.equal(shouldDeleteReport({createdAt:date},{like,wow:0,concern:0},now,policy),false);
});
test('inactividad real, acceso reciente, administrador y margen inicial',()=>{
 const user={uid:'a',metadata:{creationTime:new Date(old).toISOString(),lastSignInTime:new Date(old).toISOString()}};
 assert.equal(shouldDeleteUser(user,null,old,now,policy),true);
 assert.equal(shouldDeleteUser(user,{lastActiveAt:now-DAY},old,now,policy),false);
 assert.equal(shouldDeleteUser(user,null,now,now,policy),false);
 assert.equal(shouldDeleteUser({...user,email:policy.protectedEmails[0]},null,old,now,policy),false);
 assert.equal(shouldDeleteUser({...user,customClaims:{retentionProtected:true}},null,old,now,policy),false);
 assert.equal(shouldDeleteUser({...user,metadata:{}},null,old,now,policy),false);
 assert.equal(shouldDeleteUser({...user,metadata:{...user.metadata,lastSignInTime:new Date(now).toISOString()}},null,old,now,policy),false);
});
