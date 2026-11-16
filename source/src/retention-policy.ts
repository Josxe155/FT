/** Política compartida entre el panel y el mantenimiento. No contiene credenciales. */
export const DAY=86400000;
export function timestampMillis(value:any):number|null {
 if(typeof value?.toMillis==='function')return value.toMillis();
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
 if(typeof value==='string'&&value){const n=/^\d+$/.test(value)?Number(value):Date.parse(value);return Number.isFinite(n)&&n>=0?n:null;}
 return null;
}
export function eligiblePost(report:any,counts:any,now:number,hasComments=false):boolean {
 const created=timestampMillis(report?.createdAt);
 return created!==null&&created<=now-30*DAY&&!hasComments&&['like','wow','concern'].every(k=>Number.isInteger(counts?.[k])&&counts[k]===0)
    && ['angry','sad','love'].every(k=>Number.isInteger(counts?.[k]??0)&&(counts?.[k]??0)===0);
}
export function eligibleUser(user:any,activity:any,rolloutAt:any,now:number,protectedEmails:string[]):boolean {
 if(protectedEmails.includes(String(user.email||'').toLowerCase())||user.customClaims?.admin===true||user.customClaims?.retentionProtected===true)return false;
 const created=timestampMillis(user.createdAt??user.metadata?.creationTime),rollout=timestampMillis(rolloutAt);
 if(created===null||rollout===null)return false;
 const last=Math.max(created,rollout,timestampMillis(user.lastLoginAt??user.metadata?.lastSignInTime)||0,timestampMillis(activity?.lastActiveAt)||0);
 return last<=now-30*DAY;
}
