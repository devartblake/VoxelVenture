// Keeps the game in step with the server (when there is one): the plots' owners and businesses, claiming, taking over and visitor events.
import { useCommunity } from '../state/communityStore';
import { logLocal } from './localStats';
import { ApiFailure, apiOn, request } from './api';
import { useAccount } from '../state/accountStore';
import { netHooks, setPlayerName } from '../net/multiplayer';
import { hooks, useCityStore } from '../state/store';
import { newClickId, withClickId } from '@voxelventure/analytics';
import { visitorId } from './visitor';
import { termLabel } from '../game/leases';
import { promoBody } from '../state/promoStore';

export { visitorId };

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
    profileSlug: plot.profileSlug ?? null, // its public business page, if the owner linked one
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
    const same = (p.owner ?? null) === next.owner && (p.ownerAccount ?? null) === next.ownerAccount && p.value === next.value && (p.visits ?? 0) === next.visits && (p.takeovers ?? 0) === (next.takeovers ?? 0) && Boolean(p.userClaimed) === next.userClaimed && (p.description ?? null) === (next.description ?? null) && p.title === next.title && (p.skyline?.level ?? 0) === (next.skyline?.level ?? 0) && (p.skyline?.badges?.length ?? 0) === (next.skyline?.badges?.length ?? 0) && (p.lease?.end ?? 0) === (next.lease?.end ?? 0) && JSON.stringify(p.logo ?? null) === JSON.stringify(next.logo ?? null) && (p.profileSlug ?? null) === next.profileSlug && (next.exterior == null || JSON.stringify(p.exterior ?? null) === JSON.stringify(next.exterior));
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
  paymentReturn().catch(() => {});
  return () => {
    clearInterval(timer);
    timer = null;
    unhydrate();
    unsub();
    netHooks.onWorld = null;
  };
}

const notify = (t) => useCityStore.getState().notify(t);

// With payments on (docs/monetization/billing.md), the server answers a claim, take-over, renewal, outside upgrade or stall booking with Stripe's page to pay on, and
// holds the plot or stall for half an hour: go there. It happens once the payment is confirmed.
export function goPay(checkout) {
  // a promo code that made it free (services/api/promo.mjs): there is nothing to pay, and the url is the "paid" page itself
  notify(checkout.free ? 'Free with your code: confirming...' : `Taking you to secure payment ($${(checkout.cents / 100).toFixed(2)})...`);
  window.location.assign(checkout.url);
}

// Back from Stripe (?paid=<order> or ?canceled=<order>): say how it went once the server has heard from Stripe, and show the result.
async function paymentReturn() {
  const q = new URLSearchParams(window.location.search);
  const paid = q.get('paid');
  const canceled = q.get('canceled');
  if (!paid && !canceled) return;
  q.delete('paid');
  q.delete('canceled');
  window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}${window.location.hash}`);
  if (canceled) return notify('Payment cancelled: nothing was charged.');
  for (let i = 0; i < 15; i++) {
    const o = await request('GET', `/me/orders/${Number(paid)}`).catch(() => null);
    if (o?.status === 'paid') {
      notify(o.cents === 0 ? `Done, free with your code: ${o.label ?? 'thank you'}.` : `Payment received: ${o.label ?? 'thank you'}.`);
      return refresh();
    }
    if (o?.status === 'refunded') return notify('Somebody got there first while you were paying, so your payment has been refunded in full.');
    if (o && o.status !== 'pending') return notify('That payment did not go through. Nothing was charged.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  notify('Your payment is still being confirmed: it will show up in a minute.');
}

// Claim a plot through the server. Throws ApiFailure('auth_required') if nobody is signed in: the caller opens the sign-in form.
export async function claimRemote(plotId, form) {
  const me = useAccount.getState().account;
  if (!me) throw new ApiFailure(401, 'Sign in to claim a plot.', 'auth_required');
  try {
    const plot = await request('POST', `/plots/${plotId}/claim`, { ...business(form), ...promoBody(`claim:${plotId}`) });
    if (plot.checkout) return (goPay(plot.checkout), plot);
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(plot, me) }], true);
    notify(`You claimed ${plot.title}!`);
    return plot;
  } catch (e) {
    if (e.code === 'already_owned') await refresh().catch(() => {});
    notify(e.message);
    throw e;
  }
}

// The tenant renews their lease (in its renewal window, the grace days after it, or later if nobody has taken the plot over).
export async function renewRemote(plotId, leaseDays) {
  try {
    const r = await request('POST', `/plots/${plotId}/renew`, { ...(leaseDays ? { leaseDays } : {}), ...promoBody(`renew:${plotId}`) });
    if (r.checkout) return (goPay(r.checkout), r);
    const me = useAccount.getState().account;
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(r.plot, me) }], false);
    notify(`Lease renewed for ${termLabel(r.plot.lease.days)} ($${r.paid.toLocaleString()}).`);
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
    const r = await request('POST', `/plots/${plotId}/takeover`, { ...business(form), expectedPrice, ...promoBody(`takeover:${plotId}`) });
    if (r.checkout) return (goPay(r.checkout), r);
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(r.plot, me) }], true);
    notify(`You took over ${r.plot.title} for $${r.paidOut.toLocaleString()}. ${r.previousOwner} was paid out.`);
    return r;
  } catch (e) {
    if (e.code === 'price_changed' || e.code === 'not_for_takeover') await refresh().catch(() => {});
    notify(e.message);
    throw e;
  }
}

// Someone pressed a business's website link in the 3D city: on its card, in the directory or inside its storefront (`surface`: 'card',
// 'directory' or 'storefront', services/api/business.mjs SURFACES). It counts for the
// building, and, when the building is linked to a business profile, as a press of that profile's button with a click id added to the link
// (so the store entry, the press and any purchase line up in the profile's funnel: docs/monetization/conversions.md). Use as the link's onClick.
export function openSiteLink(e, plot, surface = 'card') {
  useCityStore.getState().recordSiteClick(plot.id);
  if (!apiOn() || !plot.profileSlug || !plot.website) return;
  const id = newClickId();
  e.currentTarget.href = withClickId(plot.website, id);
  request('POST', `/businesses/${encodeURIComponent(plot.profileSlug)}/events`, { kind: 'cta', visitor: visitorId(), source: 'city', clickId: id, surface }).catch(() => {});
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

// ---- storefronts, quests, feedback and leads (see services/api/engage.mjs) ------------------------------------------------------
// Each call asks for an account only where one is needed (the caller opens the sign-in form on auth_required).
export const fetchStorefront = (plotId) => request('GET', `/plots/${plotId}/storefront?visitor=${encodeURIComponent(visitorId())}`);
export const saveStorefront = (plotId, form) => request('PUT', `/plots/${plotId}/storefront`, form);
export const claimCouponRemote = (plotId) => request('POST', `/plots/${plotId}/coupon`, { visitor: visitorId() });
export const redeemCouponRemote = (plotId, ticket) => request('POST', `/plots/${plotId}/coupon/redeem`, { ticket });
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

// The owner pays for a more elaborate outside (more floors, a roof garden, a dome, a spire) for the rest of the lease. With payments on the server
// answers with Stripe's page to pay on, as for a claim: go there (the outside is built once the payment is confirmed). Without, it is built at once.
export async function upgradeExteriorRemote(plotId, exterior) {
  try {
    const r = await request('POST', `/plots/${plotId}/exterior`, { exterior, ...promoBody(`exterior:${plotId}`) });
    if (r.checkout) return (goPay(r.checkout), r);
    const me = useAccount.getState().account;
    useCityStore.getState().applyServerPlots([{ id: plotId, ...fromServer(r.plot, me) }], false);
    notify(r.paid > 0 ? `Your building is upgraded ($${r.paid.toLocaleString()}).` : 'The outside of your building is updated.');
    return r;
  } catch (e) {
    notify(e.message);
    throw e;
  }
}

// Visitor events, fire and forget: a failed one is dropped, never shown.
export function sendEvent(plotId, kind, extra = {}) {
  if (typeof plotId !== 'number') return;
  if (!apiOn()) {
    if (kind !== 'leave') logLocal(kind); // no server: the figures are this browser's own
    return;
  }
  request('POST', '/events', { plotId, kind, visitor: visitorId(), source: 'street', ...extra }).catch(() => {});
}

// How the player found a building (search, a billboard or banner, a shared link) counts for 30 minutes; without one it was
// found walking past ('street'). The source travels with the visit and the website click.
const ARRIVAL_MS = 30 * 60000;
const arrivals = new Map(); // plotId -> { source, at }
const entered = new Map(); // plotId -> when the player walked in
export const sourceOf = (plotId, at = Date.now()) => {
  const a = arrivals.get(plotId);
  return a && at - a.at < ARRIVAL_MS ? a.source : 'street';
};
hooks.onArrive = (plotId, source) => {
  if (['search', 'billboard', 'banner', 'friends'].includes(source)) arrivals.set(plotId, { source, at: Date.now() });
};
hooks.onLeave = (plot) => {
  const at = entered.get(plot.id);
  entered.delete(plot.id);
  if (at != null) sendEvent(plot.id, 'leave', { seconds: Math.round((Date.now() - at) / 1000) });
};

hooks.onVisit = (plot) => {
  entered.set(plot.id, Date.now());
  sendEvent(plot.id, 'visit', { source: sourceOf(plot.id) });
  // walking into a building linked to a business profile is a store entry in that profile's funnel (docs/monetization/conversions.md)
  if (apiOn() && plot.profileSlug) request('POST', `/businesses/${encodeURIComponent(plot.profileSlug)}/events`, { kind: 'store', visitor: visitorId(), source: 'city', surface: 'storefront' }).catch(() => {});
};
hooks.onClick = (plotId) => sendEvent(plotId, 'click', { source: sourceOf(plotId) });
// All three stars of the day found: it earns a bonus Building of the Week vote this week (with a server, signed in; without one, kept here).
hooks.onHuntComplete = (day) => {
  if (!apiOn()) return useCommunity.getState().huntWon();
  if (!useAccount.getState().account) return;
  request('POST', '/hunt/complete', { day, found: [0, 1, 2] }).then(() => useCommunity.getState().loadVotes()).catch(() => {});
};
const sendAdEvent = (slotId, kind) => {
  if (apiOn()) request('POST', '/ad-events', { slotId, kind, visitor: visitorId() }).catch(() => {});
};
hooks.onAdView = (id) => sendAdEvent(id, 'view');
hooks.onAdClick = (id) => sendAdEvent(id, 'click');
