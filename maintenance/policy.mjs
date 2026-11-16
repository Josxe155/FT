export const DAY = 24 * 60 * 60 * 1000;
export function millis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && value) {const n = Date.parse(value); return Number.isFinite(n) ? n : null;}
  return null;
}
export function shouldDeleteReport(report, counts, now, policy, hasComments=false) {
  const created=millis(report?.createdAt);
  return created!==null&&created<=now-policy.reportRetentionDays*DAY&&!hasComments
    && ['like','wow','concern'].every(k=>Number.isInteger(counts?.[k])&&counts[k]===0)
    && ['angry','sad','love'].every(k=>Number.isInteger(counts?.[k]??0)&&(counts?.[k]??0)===0);
}
export function protectedUser(user, policy) {
  return policy.protectedEmails.includes(String(user.email || '').toLowerCase())
    || user.customClaims?.retentionProtected === true || user.customClaims?.admin === true;
}
export function shouldDeleteUser(user, activity, rolloutAt, now, policy) {
  if (protectedUser(user, policy)) return false;
  const created = millis(user.metadata?.creationTime);
  const rollout = millis(rolloutAt);
  if (created === null || rollout === null) return false;
  const last = Math.max(created, rollout, millis(user.metadata?.lastSignInTime) || 0, millis(activity?.lastActiveAt) || 0);
  return last <= now - policy.accountInactivityDays * DAY;
}
