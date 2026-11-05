import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

// Local Admin can inspect devices without granting any outbound push access.
export function localNotificationLab(enabled, credentialsFile = '') {
  const bindings = { ADMIN_NOTIFICATION_LAB_ENABLED: enabled ? 'true' : 'false', MOBILE_PUSH_FCM_PROJECT_ID: '', MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON: '' };
  if (credentialsFile && !enabled) throw new Error('Local push requires local Admin identity');
  if (credentialsFile) {
    if (!isAbsolute(credentialsFile)) throw new Error('Local push credentials must use an absolute path');
    const stat = statSync(credentialsFile);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('Local push credentials must be a private file (chmod 600)');
    let account;
    try { account = JSON.parse(readFileSync(credentialsFile, 'utf8')); }
    catch { throw new Error('Invalid local Firebase credentials JSON'); }
    if (account.type !== 'service_account' || !/^[a-z][a-z0-9-]{4,62}$/.test(account.project_id ?? '') ||
        typeof account.client_email !== 'string' || !account.client_email.endsWith('.iam.gserviceaccount.com') ||
        typeof account.private_key !== 'string' || !account.private_key.includes('BEGIN PRIVATE KEY') ||
        (account.token_uri && account.token_uri !== 'https://oauth2.googleapis.com/token')) {
      throw new Error('Expected Firebase service-account credentials with the standard Google token endpoint');
    }
    bindings.MOBILE_PUSH_FCM_PROJECT_ID = account.project_id;
    bindings.MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(account);
  }
  return {
    bindings,
    allows(request) {
      if (!bindings.MOBILE_PUSH_FCM_PROJECT_ID || request.method !== 'POST') return false;
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false;
      return (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') ||
        (url.hostname === 'fcm.googleapis.com' && url.pathname === `/v1/projects/${bindings.MOBILE_PUSH_FCM_PROJECT_ID}/messages:send`);
    },
  };
}
