import { cache } from 'react';
import { profileFromPlot } from '@voxelventure/business-core';

// Where the public business pages get their data (server components only).
//
//   live  API_URL (or NEXT_PUBLIC_LIVE_API_URL) is set: the published profiles from the API server (services/api/business.mjs).
//   demo  no API: the generated city's own businesses, shown as a demo. Demo pages say so and are kept out of search engines
//         (they are sample businesses, not real ones).
const API = () => (process.env.API_URL || process.env.NEXT_PUBLIC_LIVE_API_URL || '').replace(/\/+$/, '');
export const isDemo = () => !API();
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

// The data is fetched fresh at most once a minute per page (profiles change rarely; a removed one disappears within a minute).
async function get(path) {
  const res = await fetch(`${API()}${path}`, { headers: { Accept: 'application/json' }, next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

let demo = null;
async function demoProfiles() {
  if (!demo) {
    const { generateCity } = await import('../city/cityGenerator');
    const city = generateCity(Number(process.env.API_SEED) || 20260101);
    demo = city.plots.filter((p) => p.owner && p.buildingType !== 'house' && p.height > 0.2).map(profileFromPlot);
  }
  return demo;
}

const matches = (p, { category, district, q }) =>
  (!category || p.category === category) && (!district || p.district === district) && (!q || `${p.name} ${p.tagline ?? ''} ${p.description ?? ''}`.toLowerCase().includes(q.toLowerCase()));

// { total, profiles } filtered like GET /businesses.
export const listBusinesses = cache(async ({ category = '', district = '', q = '', limit = 60 } = {}) => {
  if (!isDemo()) {
    const qs = new URLSearchParams({ ...(category && { category }), ...(district && { district }), ...(q && { q }), limit: String(limit) });
    return (await get(`/businesses?${qs}`)) ?? { total: 0, profiles: [] };
  }
  const all = (await demoProfiles()).filter((p) => matches(p, { category, district, q }));
  return { total: all.length, profiles: all.slice(0, limit) };
});

// One profile by slug, or null.
export const getBusiness = cache(async (slug) => {
  if (!isDemo()) return get(`/businesses/${encodeURIComponent(slug)}`);
  return (await demoProfiles()).find((p) => p.slug === slug) ?? null;
});

// Building of the Week (lib/game/buildingOfWeek.js): this week's winner (last week's most voted), this week's leaders and when voting closes,
// each with its business page when it has one: { demo, week, endsAt, winner, leaders } with { plotId, title, votes, slug }. Live: the API's
// public GET /votes. Demo: the simulated votes of the generated city (the same the game's demo shows, without anyone's own votes).
export const getBuildingOfWeek = cache(async () => {
  const { LEADERS_SHOWN, addWeeks, simulatedTally, votingClosesAt, weekStartOf } = await import('../game/buildingOfWeek');
  if (!isDemo()) {
    try {
      const v = await get('/votes');
      return v ? { demo: false, week: v.week, endsAt: v.endsAt, winner: v.winner, leaders: v.leaders ?? [] } : null;
    } catch {
      return null; // the API is down: the pages just leave this out
    }
  }
  const { generateCity } = await import('../city/cityGenerator');
  const plots = generateCity(Number(process.env.API_SEED) || 20260101).plots;
  const profiles = await demoProfiles();
  const slugOf = (plotId) => profiles.find((p) => p.plotId === plotId)?.slug ?? null;
  const withSlug = (t) => ({ ...t, slug: slugOf(t.plotId) });
  const week = weekStartOf();
  const last = simulatedTally(plots, addWeeks(week, -1))[0];
  return { demo: true, week, endsAt: votingClosesAt(week), winner: last ? withSlug({ ...last, week: addWeeks(week, -1) }) : null, leaders: simulatedTally(plots, week).slice(0, LEADERS_SHOWN).map(withSlug) };
});

// Every profile address for the sitemap (none in demo mode: sample businesses are not for search engines).
export async function sitemapSlugs() {
  if (isDemo()) return [];
  return (await get('/businesses/sitemap'))?.entries ?? [];
}

// Who is sponsored on a page right now, and (Discover) who is in their launch week: { sponsored, launches }. None in demo mode.
export const getFeatured = cache(async (placement) => {
  if (isDemo()) return { sponsored: [], launches: [] };
  try {
    const r = await get(`/businesses/featured?placement=${encodeURIComponent(placement)}`);
    return { sponsored: r?.sponsored ?? [], launches: r?.launches ?? [] };
  } catch {
    return { sponsored: [], launches: [] }; // a page never fails because of its sponsored row
  }
});
