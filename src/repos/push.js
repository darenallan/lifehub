// Web Push (phase 7.6a) : appels à l'API, en ligne uniquement.
import { api } from '../api.js';

export const pushPublicKey = () => api('/api/push/key').then((r) => r.publicKey);
export const listPushDevices = () => api('/api/push/subscriptions').then((r) => r.devices);
export const savePushSubscription = (subscription) =>
  api('/api/push/subscribe', { method: 'POST', body: subscription }).then((r) => r.id);
export const revokePushDevice = (id) =>
  api(`/api/push/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const sendPushSchedule = (reminders) =>
  api('/api/push/schedule', { method: 'POST', body: { reminders } });
