import { create } from 'zustand';
import { apiOn } from '../data/api';
import * as api from '../data/messaging';

// Chat and messages on the client (docs/chat_messaging_plan.md). Kept apart from the game's own state, so a chat never touches
// the simulation, and kept in memory only: private messages and drafts are never written to the browser's storage.
//   nearby  the lines heard near you in this city (the presence server, lib/net/multiplayer.js); cleared when the city changes
//   inbox   one-to-one conversations from the API, refreshed on a nudge from the presence server, on focus, and every half minute

const NEARBY_KEEP = 60;
const PAGE_EMPTY = { items: [], next: null, loaded: false, loading: false, error: '' };
const sameText = (a, b) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

const initialInbox = () => ({
  summary: { unread: 0, requests: 0 },
  lists: { inbox: { ...PAGE_EMPTY }, requests: { ...PAGE_EMPTY } },
  conversations: {}, // id -> the conversation as the API describes it
  messages: {}, // id -> [message], oldest first
  more: {}, // id -> there are older messages to load
  drafts: {}, // id -> unsent text
  outgoing: {}, // id -> [{ clientMessageId, text, state: 'pending' | 'failed', error }]
  openId: null,
  compose: null, // { to: { id, username } } or { plot: { id, title } }: a new message being written
  composeDraft: '',
  settings: null, // { requests, blocks }
  sendingCompose: false,
  error: '',
});

export const useChat = create(() => ({
  tab: 'nearby', // 'nearby' | 'inbox'
  box: 'inbox', // 'inbox' | 'requests'
  nearby: [], // { key, messageId, connId, account, verified, name, text, at, mine, state: 'sent' | 'pending' | 'failed', error, clientMessageId }
  nearbyDraft: '',
  nearbyUnseen: 0, // lines from others since the Nearby tab was last on screen
  hidden: {}, // connection id -> true: lines from these players are hidden (this visit only)
  features: null, // what the presence server can do (its welcome)
  presenceAccount: null, // the account the presence server has bound this connection to
  ...initialInbox(),
}));

const set = (patch) => useChat.setState(typeof patch === 'function' ? patch(useChat.getState()) : patch);
const get = () => useChat.getState();

// ---- nearby (fed by lib/net/multiplayer.js) ----------------------------------------------------------------------------------------
const trim = (list) => (list.length > NEARBY_KEEP ? list.slice(-NEARBY_KEEP) : list);

export function nearbyPending(clientMessageId, text) {
  set((s) => ({ nearby: trim([...s.nearby.filter((l) => l.clientMessageId !== clientMessageId), { key: clientMessageId, clientMessageId, mine: true, name: 'You', text, at: Date.now(), state: 'pending' }]) }));
}
export function nearbyAnswer(m) {
  set((s) => ({
    nearby: s.nearby.map((l) =>
      l.clientMessageId !== m.clientMessageId ? l : m.type === 'chat.accepted' ? { ...l, state: 'sent', messageId: m.messageId, error: '' } : { ...l, state: 'failed', error: m.message || 'Not sent.', code: m.code, retryAfterMs: m.retryAfterMs }
    ),
  }));
}
export function nearbyFailed(clientMessageId, error) {
  set((s) => ({ nearby: s.nearby.map((l) => (l.clientMessageId === clientMessageId ? { ...l, state: 'failed', error } : l)) }));
}
// A line heard. Your own comes back too: it is matched to the one you are sending rather than shown twice.
export function nearbyHeard(m, myId, seeingNearby) {
  const s = get();
  if (m.messageId && s.nearby.some((l) => l.messageId === m.messageId)) return;
  const mine = m.id === myId;
  if (mine) {
    const own = s.nearby.find((l) => l.mine && !l.messageId && sameText(l.text, m.text));
    if (own) return set({ nearby: s.nearby.map((l) => (l === own ? { ...l, messageId: m.messageId, state: 'sent', text: m.text, at: m.at } : l)) });
  }
  const line = { key: m.messageId || `${m.id}-${m.at}`, messageId: m.messageId ?? null, connId: m.id, account: m.account ?? null, verified: Boolean(m.verified), name: String(m.name ?? ''), text: String(m.text ?? ''), at: Number(m.at) || Date.now(), mine, state: 'sent' };
  set({ nearby: trim([...s.nearby, line]), nearbyUnseen: mine || seeingNearby ? s.nearbyUnseen : s.nearbyUnseen + 1 });
}
// A new city (or a new connection): what was said in the old one is not carried over, and nothing waiting is sent there.
export function clearNearby() {
  set({ nearby: [], nearbyUnseen: 0 });
}
export function failPendingNearby(error) {
  set((s) => ({ nearby: s.nearby.map((l) => (l.state === 'pending' ? { ...l, state: 'failed', error } : l)) }));
}
export const setNearbyDraft = (nearbyDraft) => set({ nearbyDraft });
export const seenNearby = () => get().nearbyUnseen && set({ nearbyUnseen: 0 });
export const hidePlayer = (connId) => set((s) => ({ hidden: { ...s.hidden, [connId]: true } }));
export const showPlayer = (connId) => set((s) => { const hidden = { ...s.hidden }; delete hidden[connId]; return { hidden }; });
export const setPresence = (patch) => set(patch);

// ---- the inbox ---------------------------------------------------------------------------------------------------------------------
const failText = (e) => e?.message || 'Something went wrong.';

export async function refreshSummary() {
  if (!apiOn()) return;
  try {
    const summary = await api.fetchSummary();
    set({ summary: { unread: summary.unread, requests: summary.requests } });
    return true;
  } catch (e) {
    if (e?.status === 401) return true; // signed out: nothing to count
    return false;
  }
}

export async function loadList(box, { more = false } = {}) {
  const page = get().lists[box];
  if (page.loading) return;
  set((s) => ({ lists: { ...s.lists, [box]: { ...s.lists[box], loading: true, error: '' } } }));
  try {
    const out = await api.fetchConversations(box, more ? page.next : undefined);
    set((s) => {
      const conversations = { ...s.conversations };
      for (const c of out.conversations) conversations[c.id] = c;
      const items = more ? [...s.lists[box].items, ...out.conversations.map((c) => c.id).filter((id) => !s.lists[box].items.includes(id))] : out.conversations.map((c) => c.id);
      return { conversations, summary: { unread: out.unread, requests: out.requests }, lists: { ...s.lists, [box]: { items, next: out.nextCursor, loaded: true, loading: false, error: '' } } };
    });
  } catch (e) {
    set((s) => ({ lists: { ...s.lists, [box]: { ...s.lists[box], loading: false, error: failText(e) } } }));
  }
}

const mergeMessages = (old = [], add = []) => {
  const byId = new Map(old.map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
};

export async function openConversation(id) {
  set({ openId: id, compose: null, error: '' });
  try {
    const [conversation, page] = await Promise.all([api.fetchConversation(id), api.fetchMessages(id)]);
    set((s) => ({ conversations: { ...s.conversations, [id]: conversation }, messages: { ...s.messages, [id]: mergeMessages(s.messages[id], page.messages) }, more: { ...s.more, [id]: page.more } }));
  } catch (e) {
    set({ error: failText(e), ...(e?.status === 404 ? { openId: null } : {}) });
  }
}
export const closeConversation = () => set({ openId: null, error: '' });

export async function loadOlder(id) {
  const first = get().messages[id]?.[0];
  if (!first) return;
  try {
    const page = await api.fetchMessages(id, { before: first.id });
    set((s) => ({ messages: { ...s.messages, [id]: mergeMessages(s.messages[id], page.messages) }, more: { ...s.more, [id]: page.more } }));
  } catch (e) {
    set({ error: failText(e) });
  }
}

// What arrived since the newest message we have (a nudge, focus, or after sending).
async function fetchNewer(id) {
  const list = get().messages[id] ?? [];
  const last = list[list.length - 1];
  const [conversation, page] = await Promise.all([api.fetchConversation(id), last ? api.fetchMessages(id, { after: last.id }) : api.fetchMessages(id)]);
  set((s) => ({ conversations: { ...s.conversations, [id]: conversation }, messages: { ...s.messages, [id]: mergeMessages(s.messages[id], page.messages) } }));
}

// The presence server says something changed in a conversation (or we came back to the page): fetch only what is needed.
export async function inboxChanged(conversationId) {
  if (!apiOn()) return;
  await refreshSummary();
  const s = get();
  if (conversationId && s.openId === conversationId) await fetchNewer(conversationId).catch(() => {});
  for (const box of ['inbox', 'requests']) if (s.lists[box].loaded) loadList(box);
}

export const setDraft = (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } }));

const setOutgoing = (id, fn) => set((s) => ({ outgoing: { ...s.outgoing, [id]: fn(s.outgoing[id] ?? []) } }));

// Sends `text` in conversation `id`. It shows at once as "Sending"; on failure it stays, with the reason and a Retry that reuses the
// same clientMessageId (so a send that did arrive but whose answer was lost is not doubled).
export async function sendInbox(id, text, clientMessageId = api.newClientId()) {
  const body = String(text ?? '').trim();
  if (!body) return false;
  setOutgoing(id, (list) => [...list.filter((o) => o.clientMessageId !== clientMessageId), { clientMessageId, text: body, state: 'pending' }]);
  try {
    const out = await api.postMessage(id, body, clientMessageId);
    setOutgoing(id, (list) => list.filter((o) => o.clientMessageId !== clientMessageId));
    set((s) => ({ messages: { ...s.messages, [id]: mergeMessages(s.messages[id], [out.message]) } }));
    fetchNewer(id).catch(() => {});
    return true;
  } catch (e) {
    setOutgoing(id, (list) => list.map((o) => (o.clientMessageId === clientMessageId ? { ...o, state: 'failed', error: failText(e), code: e?.code } : o)));
    return false;
  }
}
export const retryInbox = (id, clientMessageId) => {
  const o = (get().outgoing[id] ?? []).find((x) => x.clientMessageId === clientMessageId);
  if (o) sendInbox(id, o.text, clientMessageId);
};
export const discardOutgoing = (id, clientMessageId) => setOutgoing(id, (list) => list.filter((o) => o.clientMessageId !== clientMessageId));

// Start writing to a player ({ id, username }) or to a building's owner ({ plot: { id, title } }). If you already talk to that
// player, their conversation opens instead.
export function composeTo(target) {
  const s = get();
  if (target.to) {
    const existing = Object.values(s.conversations).find((c) => c.kind === 'direct' && c.other?.id === target.to.id);
    if (existing) {
      set({ tab: 'inbox' });
      return openConversation(existing.id);
    }
  }
  set({ tab: 'inbox', openId: null, compose: target, error: '' });
}
export const cancelCompose = () => set({ compose: null, error: '' });
export const setComposeDraft = (composeDraft) => set({ composeDraft });

export async function sendCompose(clientMessageId) {
  const { compose, composeDraft } = get();
  const text = composeDraft.trim();
  if (!compose || !text) return false;
  set({ error: '', sendingCompose: true });
  try {
    const out = compose.plot ? await api.startInquiry(compose.plot.id, text, clientMessageId) : await api.startConversation(compose.to, text, clientMessageId);
    set((s) => ({ composeDraft: '', compose: null, sendingCompose: false, conversations: { ...s.conversations, [out.conversation.id]: out.conversation } }));
    await openConversation(out.conversation.id);
    loadList('inbox');
    return true;
  } catch (e) {
    set({ error: failText(e), sendingCompose: false });
    return false;
  }
}

export async function respondRequest(id, action) {
  try {
    const conversation = await api.answerRequest(id, action);
    set((s) => ({ conversations: { ...s.conversations, [id]: conversation }, ...(action === 'decline' ? { openId: null } : {}) }));
    loadList('requests');
    loadList('inbox');
  } catch (e) {
    set({ error: failText(e) });
  }
}

// I have seen everything up to `upTo` (only called while the conversation is on screen with its newest messages showing).
export async function markRead(id, upTo) {
  const c = get().conversations[id];
  if (!c || upTo <= (c.lastRead ?? 0)) return;
  set((s) => ({ conversations: { ...s.conversations, [id]: { ...c, lastRead: upTo, unread: 0 } } }));
  try {
    const out = await api.markReadRemote(id, upTo);
    set({ summary: { unread: out.unread, requests: out.requests } });
  } catch {
    /* the next refresh corrects the counts */
  }
}

export async function setMuted(id, muted) {
  try {
    const conversation = await api.setMutedRemote(id, muted);
    set((s) => ({ conversations: { ...s.conversations, [id]: conversation } }));
  } catch (e) {
    set({ error: failText(e) });
  }
}

export async function loadSettings() {
  try {
    set({ settings: await api.fetchMessagingSettings() });
  } catch (e) {
    set({ error: failText(e) });
  }
}
export async function setRequestsAllowed(requests) {
  try {
    set({ settings: await api.setMessagingSettings({ requests }) });
  } catch (e) {
    set({ error: failText(e) });
  }
}
// Blocking stops their private messages and their nearby lines both ways (the servers enforce it); their lines already shown here go now.
export async function blockAccount(accountId) {
  await api.blockRemote(accountId);
  set((s) => ({ nearby: s.nearby.filter((l) => l.account !== accountId) }));
  loadSettings();
  for (const box of ['inbox', 'requests']) if (get().lists[box].loaded) loadList(box);
}
export async function unblockAccount(accountId) {
  await api.unblockRemote(accountId);
  loadSettings();
}
export const reportMessage = (messageId, category) => api.reportMessageRemote(messageId, category);

// Keeps the unread counts fresh while signed in: now, when the page comes back into view, and every half minute (backing off to five
// minutes while the server cannot be reached). The presence server's nudges (inboxChanged) make most of these unnecessary.
export function startInboxSync() {
  let stopped = false;
  let timer = null;
  let wait = 30000;
  const tick = async () => {
    if (stopped) return;
    const ok = await refreshSummary();
    wait = ok ? 30000 : Math.min(wait * 2, 300000);
    clearTimeout(timer);
    timer = setTimeout(tick, wait);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') inboxChanged(get().openId);
  };
  tick();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// Signing out (or in as someone else) leaves nothing private behind.
export function resetPrivate() {
  set({ ...initialInbox(), presenceAccount: null });
}
export const setTab = (tab) => set({ tab });
export const setBox = (box) => set({ box });
