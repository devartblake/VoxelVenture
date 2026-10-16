// Keeps the game in step with the server (when there is one): the plots' owners and businesses, claiming, taking over and visitor events.
import { useCommunity } from '../state/communityStore';
import { logLocal } from './localStats';
import { ApiFailure, apiOn, request } from './api';
import { useAccount } from '../state/accountStore';
import { netHooks, setPlayerName } from '../net/multiplayer';
import { hooks, useCityStore } from '../state/store';

// The server's view of a plot, in the shape the game uses.
export function fromServer(plot, me) {
  return {
    owner: plot.owner ?? null,
    title: plot.title,
    website: plot.website,
    buildingType: plot.buildingType ?? undefined,
    logo: plot.logo ?? undefined,
    description: plot.description ?? undefined,
    value: plot.value,
    visits: plot.visits,
    takeovers: plot.takeovers,
    userClaimed: Boolean(me && plot.ownerAccount === me.id),
    ownerAccount: plot.ownerAccount ?? null, // a player owns it (the city's own businesses have none): they can be messaged
    lease: plot.lease ?? null,
    skyline: plot.skyline ?? null,
    exterior: plot.exterior ?? null, // the outside the owner set up, kept by the server
  };
}

// The business the player filled in, as the server wants it.
const business = (b) => ({ title: b.title, buildingType: b.buildingType, website: b.website, variant: b.variant, logo: b.logo, description: b.description, ...(b.exterior ? { exterior: b.exterior } : {}), ...(b.leaseDays ? { leaseDays: b.leaseDays } : {}) });

// Applies the server's list of plots over the game's. (Also Building of the Week.) Only plots that changed are touched.
export function applyState(state, me) {
  const { plots, applyServerPlots } = useCityStore.getState();
  const byId = new Map(plots.map((p) => [p.id, p]));
  const changed = [];
  for (const sp of state.plots) {
    const p = byId.get(sp.id);
    if (!p) continue;
    const next = fromServer(sp, me);
    const same = (p.owner ?? null) === next.owner && (p.ownerAccount ?? null) === next.ownerAccount && p.value === next.value && (p.visits ?? 0) === next.visits && (p.takeovers ?? 0) === (next.takeovers ?? 0) && Boolean(p.userClaimed) === next.userClaimed && (p.description ?? null) === (next.description ?? null) && p.title === next.title && (p.skyline?.level ?? 0) === (next.skyline?.level ?? 0) && (p.skyline?.badges?.length ?? 0) === (next.skyline?.badges?.length ?? 0) && (p.lease?.end ?? 0) === (next.lease?.end ?? 0) && JSON.stringify(p.logo ?? null) === JSON.stringify(next.logo ?? null) && (next.exterior == null || JSON.stringify(p.exterior ?? null) === JSON.stringify(next.exterior));
    if (!same) changed.push({ id: sp.id, ...next });
  }
  if (changed.length) applyServerPlots(changed);
  if (state.ads) applyAds(state.ads);
  useCommunity.getState().setBotw(state.botw ?? null);
  return changed.length;
}

// Applies the server's ad slots (only when something differs).
export function applyAds(ads) {
  const have = useCityStore.getState().billboards;
  const differs = ads.some((a) => { const b = have.find((x) => x.id === a.id); return b && (b.value !== a.value || b.views !== a.views || b.clicks !== a.clicks || JSON.stringify(b.ad) !== JSON.stringify(a.ad)); });
  if (differs) useCityStore.getState().applyServerAds(ads);
}

export async function refresh() {
  if (!apiOn()) return 0;
  return applyState(await request('GET', '/plots/state'), useAccount.getState().account);
}

let timer = null;
// Starts syncing: now, every 15 seconds, and whenever the player signs in or out.
export function startSync() {
  if (!apiOn() || timer) return () => {};
  const tick = () => refresh().catch(() => {});
  tick();
  timer = setInterval(tick, 15000);
  const unsub = useAccount.subscribe((s, prev) => {
    if (s.account?.id !== prev.account?.id) tick();
    if (s.account && s.account.id !== prev.account?.id) setPlayerName(s.account.username); // other players see your account name
  });
  // the server pushes a change (somebody claimed a plot): look at once instead of waiting for the next tick
  netHooks.onWorld = tick;
  // loading the saved game replaces the plots (and with them the server's counts from the first look): look again at once, so the
  // generated figures of a fresh city are never on show until the next tick
  const unhydrate = useCityStore.persist?.onFinishHydration?.(tick) ?? (() => {});
  return () => {
    clearInterval(timer);
    timer = null;
    unhydrate();
    unsub();
    netHooks.onWorld = null;
  };
}

const notify = (t) => useCityStore.getState().notify(t);

// Claim a plot through the server. Throws ApiFailure('auth_required') if nobody is signed in: the caller opens the sign-in form.
export async function claimRemote(plotId, form) {
  const me = useAccount.getState().account;
  if (!me) throw new ApiFailure(401, 'Sign in to claim a plot.', 'auth_required');
  try {
    const plot = await request('POST', `/plots/${plotId}/claim`, business(form));
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(plot, me) }], true);
    notify(`You claimed ${plot.title}!`);
    return plot;
  } catch (e) {
    if (e.code === 'already_owned') await refresh().catch(() => {});
    notify(e.message);
    throw e;
  }
}

// The tenant renews their lease (in its last 14 days, the grace week after it, or later if nobody has taken the plot over).
export async function renewRemote(plotId, leaseDays) {
  try {
    const r = await request('POST', `/plots/${plotId}/renew`, leaseDays ? { leaseDays } : {});
    const me = useAccount.getState().account;
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(r.plot, me) }], false);
    notify(`Lease renewed for ${r.plot.lease.days} days ($${r.paid.toLocaleString()}).`);
    return r;
  } catch (e) {
    notify(e.message);
    throw e;
  }
}

export async function takeOverRemote(plotId, form, expectedPrice) {
  const me = useAccount.getState().account;
  if (!me) throw new ApiFailure(401, 'Sign in to take over a business.', 'auth_required');
  try {
    const r = await request('POST', `/plots/${plotId}/takeover`, { ...business(form), expectedPrice });
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(r.plot, me) }], true);
    notify(`You took over ${r.plot.title} for $${r.paidOut.toLocaleString()}. ${r.previousOwner} was paid out.`);
    return r;
  } catch (e) {
    if (e.code === 'price_changed' || e.code === 'not_for_takeover') await refresh().catch(() => {});
    notify(e.message);
    throw e;
  }
}

// Buy or take over an ad space through the server (see the billboard card).
export async function buyAdRemote(slotId, ad, expectedPrice) {
  if (!useAccount.getState().account) throw new ApiFailure(401, 'Sign in to buy an ad space.', 'auth_required');
  try {
    const r = await request('POST', `/ads/${slotId}/buy`, { ...ad, expectedPrice });
    applyAds([r.slot]);
    notify(r.previousAdvertiser ? `You took over the ad space for $${r.slot.value.toLocaleString()}. ${r.previousAdvertiser} was paid out.` : `You booked the ad space for $${r.slot.value.toLocaleString()}.`);
    return r;
  } catch (e) {
    if (e.code === 'price_changed') await refresh().catch(() => {});
    notify(e.message);
    throw e;
  }
}

// ---- storefronts, quests, feedback and leads (see server/api/engage.mjs) ------------------------------------------------------
// Each call asks for an account only where one is needed (the caller opens the sign-in form on auth_required).
export const fetchStorefront = (plotId) => request('GET', `/plots/${plotId}/storefront?visitor=${encodeURIComponent(visitorId())}`);
export const saveStorefront = (plotId, form) => request('PUT', `/plots/${plotId}/storefront`, form);
export const claimCouponRemote = (plotId) => request('POST', `/plots/${plotId}/coupon`, { visitor: visitorId() });
export const startQuestRemote = (plotId) => request('POST', `/plots/${plotId}/quest/start`);
export async function completeQuestRemote(plotId) {
  const r = await request('POST', `/plots/${plotId}/quest/complete`);
  if (r.paid > 0) useAccount.setState((s) => (s.account ? { account: { ...s.account, gold: r.wallet } } : s));
  return r;
}
export async function fundQuestRemote(plotId, gold) {
  const r = await request('POST', `/plots/${plotId}/quest/fund`, { gold });
  useAccount.setState((s) => (s.account ? { account: { ...s.account, gold: r.wallet } } : s));
  return r;
}
export const postFeedbackRemote = (plotId, message) => request('POST', `/plots/${plotId}/feedback`, { message });
export const hideFeedbackRemote = (plotId, id, hide = true) => request('POST', `/plots/${plotId}/feedback/${id}/${hide ? 'hide' : 'show'}`);
export const subscribeRemote = (target, email, source) => request('POST', '/leads', { targetKind: target.kind, targetId: target.id, email, source });
export const leadsRemote = (kind, id) => request('GET', kind === 'ad' ? `/ads/${id}/leads` : `/plots/${id}/leads`);
export async function setEmailRemote(change) {
  const r = await request('PATCH', '/me', change);
  useAccount.setState({ account: r.account });
  return r.account;
}
export const walletRemote = () => request('GET', '/me/wallet');
export const myLeadsRemote = () => request('GET', '/me/leads');
export const reportRemote = (kind, id, reason) => request('POST', '/reports', { kind, id, reason });

export const updateRemote = (plotId, change) => request('PATCH', `/plots/${plotId}`, change);

// Visitor events, fire and forget: a failed one is dropped, never shown.
export const visitorId = () => {
  try {
    const k = 'voxelventure-visitor';
    return localStorage.getItem(k) || (localStorage.setItem(k, Math.random().toString(36).slice(2)), localStorage.getItem(k));
  } catch {
    return 'anon';
  }
};
export function sendEvent(plotId, kind, extra = {}) {
  if (typeof plotId !== 'number') return;
  if (!apiOn()) {
    logLocal(kind); // no server: the figures are this browser's own
    return;
  }
  request('POST', '/events', { plotId, kind, visitor: visitorId(), source: 'street', ...extra }).catch(() => {});
}

hooks.onVisit = (plot) => sendEvent(plot.id, 'visit');
hooks.onClick = (plotId) => sendEvent(plotId, 'click');
// All three stars of the day found: it earns this week's Building of the Week vote (signed in, with a server).
hooks.onHuntComplete = (day) => {
  if (!apiOn() || !useAccount.getState().account) return;
  request('POST', '/hunt/complete', { day, found: [0, 1, 2] }).then(() => useCommunity.getState().loadVotes()).catch(() => {});
};
const sendAdEvent = (slotId, kind) => {
  if (apiOn()) request('POST', '/ad-events', { slotId, kind, visitor: visitorId() }).catch(() => {});
};
hooks.onAdView = (id) => sendAdEvent(id, 'view');
hooks.onAdClick = (id) => sendAdEvent(id, 'click');
