// The inbox's calls to the API (services/api/messaging.mjs). Every write carries a clientMessageId the caller made, so a retry after a
// lost answer finds the first copy instead of sending twice.
import { request } from './api';

export const newClientId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : '';
};

export const messagingTicket = () => request('POST', '/messaging/ticket');
export const fetchSummary = () => request('GET', '/messaging/summary');
export const fetchConversations = (box, cursor) => request('GET', `/conversations${q({ box, cursor, limit: 30 })}`);
export const fetchConversation = (id) => request('GET', `/conversations/${encodeURIComponent(id)}`);
export const fetchMessages = (id, { before, after } = {}) => request('GET', `/conversations/${encodeURIComponent(id)}/messages${q({ before, after, limit: 50 })}`);
export const postMessage = (id, text, clientMessageId) => request('POST', `/conversations/${encodeURIComponent(id)}/messages`, { text, clientMessageId });
export const startConversation = (to, text, clientMessageId) => request('POST', '/conversations', { ...(to.id ? { accountId: to.id } : { username: to.username }), text, clientMessageId });
export const startInquiry = (plotId, text, clientMessageId) => request('POST', `/plots/${plotId}/inquiries`, { text, clientMessageId });
export const answerRequest = (id, action) => request('POST', `/conversations/${encodeURIComponent(id)}/request`, { action });
export const markReadRemote = (id, upTo) => request('POST', `/conversations/${encodeURIComponent(id)}/read`, { upTo });
export const setMutedRemote = (id, muted) => request('PATCH', `/conversations/${encodeURIComponent(id)}/preferences`, { muted });
export const fetchMessagingSettings = () => request('GET', '/messaging/settings');
export const setMessagingSettings = (change) => request('PATCH', '/messaging/settings', change);
export const blockRemote = (accountId) => request('POST', '/messaging/blocks', { accountId });
export const unblockRemote = (accountId) => request('DELETE', `/messaging/blocks/${accountId}`);
export const reportMessageRemote = (messageId, category) => request('POST', '/messaging/reports', { messageId, category });
