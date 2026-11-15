// Builds the catalogue of daily and weekly player tasks from the city itself (docs/product/daily_weekly_tasks.md): every place, road, district, business, fish,
// sound zone and wardrobe item a task mentions is read from the game's own data, so the catalogue cannot name something that is not there. Design data only:
// nothing in the game reads it yet.
//
//   node scripts/tasks/build-task-catalogue.mjs            writes docs/product/task_catalogue.json and task_catalogue.csv
//   node scripts/tasks/build-task-catalogue.mjs --seed N   for another city seed (default: the live city's, 20260101)
//
// A task: { id, cadence: daily|weekly, category, family, title, text, tier: easy|medium|hard, gold, goal, signal, requires, seedBound }
//   signal   tracked-today       the game already records what the task needs (a visit, a star, the chest, a vote, a fish, an owned or worn item)
//            needs-position      needs a check of where the avatar is (reach a place, walk a road, be somewhere at dusk): new code, no new mechanic
//            needs-new-event     needs an event the game does not record yet (a chat message, an emote, minutes in a car or a boat, a flight)
//   requires 'signed-in' | 'owns-item' | 'owns-listing': who can be given the task (the schedule skips it for everyone else)
//   seedBound the task names something that exists only in this city seed (a business, a bridge): regenerate when the seed changes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imp } from '../lib-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Gold by tier (docs/product/daily_weekly_tasks.md, "Rewards"): small next to the chest, the stars and the fish, which already pay about 275 a day.
export const GOLD = { daily: { easy: 5, medium: 10, hard: 20 }, weekly: { easy: 30, medium: 60, hard: 120 } };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** The names the tasks use, from the city generator for `seed` (the same city every player of that seed sees). */
export async function worldFacts(seed) {
  const { generateCity } = await imp('city/cityGenerator.js');
  const city = generateCity(seed);
  const L = city.layout;
  const label = Object.fromEntries((L.districts ?? []).map((d) => [d.id, String(d.name ?? d.label ?? d.id).replace(/ \(suburb\)$/, '')]));
  const districts = ['saas', 'creator', 'bazaar', 'arcade', 'suburb', 'meadow', 'lakeside', 'riverside', 'outskirts', 'countryside'].filter((id) => label[id]).map((id) => ({ id, name: label[id] }));
  const bridgeName = (id) => { const p = id.split('-'); return p[1] === 'avenue' ? `the ${label[p[3]] ?? cap(p[3])} avenue bridge` : `the ${cap(p[2])} County bridge`; };
  const businesses = city.plots
    .filter((p) => p.generated && p.title && !/^Empty/.test(p.title) && p.buildingType)
    .map((p) => ({ id: p.id, title: p.title, district: p.districtId, type: p.buildingType, prime: Boolean(p.prime), luxury: Boolean(p.luxury), grand: Boolean(p.grand) }));
  return {
    districts,
    label,
    parks: (L.parks ?? []).map((p) => ({ id: p.id ?? p.name, name: p.name })),
    lakes: (L.lakes ?? []).map((l) => ({ id: l.id, name: l.name })),
    bridges: (L.bridges ?? []).map((b) => ({ id: b.id, name: bridgeName(b.id) })),
    airports: (L.airports ?? []).map((a) => ({ id: a.id ?? a.name, name: a.name })),
    malls: (L.malls ?? []).map((m) => ({ id: m.id ?? m.name, name: m.name })),
    funPark: L.amusement ? { id: 'amusement', name: L.amusement.name } : null,
    piers: (L.piers ?? []).map((p, i) => ({ id: p.id ?? `pier-${i + 1}`, name: `Pier ${i + 1}` })),
    river: (L.rivers ?? [])[0] ? { id: L.rivers[0].id, name: L.rivers[0].name ?? 'the river' } : null,
    roads: [...new Set((L.roads ?? []).map((r) => r.name).filter(Boolean))],
    businesses,
  };
}

export async function buildCatalogue(seed = 20260101) {
  const W = await worldFacts(seed);
  const { COSMETICS } = await imp('game/cosmetics.js');
  const { FISH } = await imp('sim/vehicles.js');
  const { ZONES } = await imp('game/soundZones.js');
  const tasks = [];
  const counters = {};
  const add = (cadence, category, family, title, text, tier, goal, signal, { requires = [], gold = null, seedBound = false } = {}) => {
    const key = `${cadence[0].toUpperCase()}-${category}`;
    counters[key] = (counters[key] ?? 0) + 1;
    tasks.push({ id: `${key}-${String(counters[key]).padStart(3, '0')}`, cadence, category, family, title, text, tier, gold: gold ?? GOLD[cadence][tier], goal, signal, requires, seedBound });
  };
  const D = (...a) => add('daily', ...a);
  const Wk = (...a) => add('weekly', ...a);
  const T = 'tracked-today', P = 'needs-position', E = 'needs-new-event';

  // ---- explore the districts
  const types = ['shop', 'restaurant', 'office'];
  for (const d of W.districts) {
    D('EXP', 'district-walk', `Walk through ${d.name}`, `Take a stroll through ${d.name} and see what is on its streets.`, 'easy', { type: 'be-in', district: d.id }, P);
    const here = W.businesses.filter((b) => b.district === d.id);
    if (here.length >= 2) D('EXP', 'district-visit', `Step inside 2 businesses in ${d.name}`, `Walk into any two businesses in ${d.name}.`, 'medium', { type: 'visit-businesses', district: d.id, count: 2 }, T);
    if (here.length >= 5) Wk('EXP', 'district-visit-week', `Visit 5 businesses in ${d.name}`, `Over the week, step inside five different businesses in ${d.name}.`, 'medium', { type: 'visit-businesses', district: d.id, count: 5, distinct: true }, T);
    for (const type of types) {
      const n = here.filter((b) => b.type === type).length;
      if (n >= 1) D('EXP', 'district-type', `Visit ${type === 'office' ? 'an office' : `a ${type}`} in ${d.name}`, `Find ${type === 'office' ? 'an office' : `a ${type}`} in ${d.name} and step inside.`, 'easy', { type: 'visit-businesses', district: d.id, buildingType: type, count: 1 }, T);
      if (n >= 3) Wk('EXP', 'district-type-week', `Visit 3 ${type === 'shop' ? 'shops' : type === 'restaurant' ? 'restaurants' : 'offices'} in ${d.name}`, `Step inside three different ${type === 'office' ? 'offices' : `${type}s`} in ${d.name} this week.`, 'medium', { type: 'visit-businesses', district: d.id, buildingType: type, count: 3, distinct: true }, T);
    }
  }
  for (let i = 0; i < W.districts.length; i++) for (let j = i + 1; j < W.districts.length; j++) {
    const a = W.districts[i], b = W.districts[j];
    D('EXP', 'district-trip', `Walk from ${a.name} to ${b.name}`, `Start in ${a.name} and walk all the way to ${b.name}.`, 'medium', { type: 'travel', from: a.id, to: b.id, mode: 'walk' }, P);
  }
  for (const phase of ['dawn', 'day', 'dusk', 'night']) for (const d of W.districts) {
    const when = { dawn: 'at dawn', day: 'in daylight', dusk: 'at dusk', night: 'at night' }[phase];
    D('TIM', 'district-phase', `Be in ${d.name} ${when}`, `Stand in ${d.name} ${when} (the city's clock is shared by everyone).`, phase === 'night' ? 'medium' : 'easy', { type: 'be-in', district: d.id, phase }, P);
  }

  // ---- named places
  const places = [
    ...W.parks.map((p) => ({ ...p, kind: 'park', verb: `Walk the paths of ${p.name}`, circle: `Go once around the fountain in ${p.name}` })),
    ...W.lakes.map((p) => ({ ...p, kind: 'lake', verb: `Walk to the shore of ${p.name}`, circle: `Walk all the way round ${p.name}` })),
    ...W.bridges.map((p) => ({ ...p, kind: 'bridge', verb: `Walk across ${p.name}`, circle: `Cross ${p.name} and come back` })),
    ...W.airports.map((p) => ({ ...p, kind: 'airport', verb: `Walk up to the terminal at ${p.name}`, circle: `Walk the length of the runway fence at ${p.name}` })),
    ...W.malls.map((p) => ({ ...p, kind: 'mall', verb: `Walk into ${p.name}`, circle: `Walk the whole length of ${p.name}` })),
    ...(W.funPark ? [{ ...W.funPark, kind: 'funpark', verb: `Walk in through the gate of ${W.funPark.name}`, circle: `Walk round all four rides in ${W.funPark.name}` }] : []),
    ...W.piers.map((p) => ({ ...p, kind: 'pier', verb: `Walk out to the end of ${p.name}`, circle: `Walk along ${p.name} and back` })),
    ...(W.river ? [{ ...W.river, kind: 'river', verb: `Walk along the bank of ${W.river.name}`, circle: `Follow ${W.river.name} for as far as the promenade goes` }] : []),
  ];
  for (const p of places) {
    const goal = { type: 'reach', place: p.kind, id: p.id };
    D('PLC', 'place-reach', p.verb, `${p.verb}.`, 'easy', goal, P, { seedBound: true });
    D('PLC', 'place-loop', p.circle, `${p.circle}.`, 'medium', { ...goal, loop: true }, P, { seedBound: true });
    Wk('PLC', 'place-week', `Visit ${p.name} on 3 different days`, `Be at ${p.name} on three different days this week.`, 'medium', { ...goal, days: 3 }, P, { seedBound: true });
    D('PLC', 'place-dusk', `See ${p.name} at dusk`, `Be at ${p.name} while the sky is turning.`, 'easy', { ...goal, phase: 'dusk' }, P, { seedBound: true });
    D('PLC', 'place-night', `See ${p.name} at night`, `Be at ${p.name} after dark, when the street lamps are lit.`, 'medium', { ...goal, phase: 'night' }, P, { seedBound: true });
  }

  // ---- roads
  for (const road of W.roads) {
    D('RDS', 'road-walk', `Walk the length of ${road}`, `Walk from one end of ${road} to the other.`, 'medium', { type: 'road', road, mode: 'walk' }, P, { seedBound: true });
    D('RDS', 'road-drive', `Drive along ${road}`, `Take a car from one end of ${road} to the other.`, 'medium', { type: 'road', road, mode: 'drive' }, E, { seedBound: true });
  }

  // ---- distance
  for (const m of [500, 1000, 2000, 3500]) D('DST', 'distance-walk', `Walk ${m >= 1000 ? `${m / 1000} km` : `${m} m`}`, `Cover ${m >= 1000 ? `${m / 1000} km` : `${m} metres`} on foot today.`, m < 1000 ? 'easy' : m < 3000 ? 'medium' : 'hard', { type: 'distance', mode: 'walk', metres: m }, P);
  for (const m of [500, 1500, 3000]) D('DST', 'distance-drive', `Drive ${m >= 1000 ? `${m / 1000} km` : `${m} m`}`, `Cover ${m >= 1000 ? `${m / 1000} km` : `${m} metres`} in a car today.`, m < 1000 ? 'easy' : m < 2500 ? 'medium' : 'hard', { type: 'distance', mode: 'drive', metres: m }, E);
  for (const m of [300, 800]) D('DST', 'distance-sail', `Sail ${m} m`, `Cover ${m} metres in a boat today.`, m < 500 ? 'easy' : 'medium', { type: 'distance', mode: 'sail', metres: m }, E);
  for (const km of [8, 15, 25]) Wk('DST', 'distance-walk-week', `Walk ${km} km this week`, `Cover ${km} km on foot over the week.`, km < 10 ? 'easy' : km < 20 ? 'medium' : 'hard', { type: 'distance', mode: 'walk', metres: km * 1000 }, P);
  for (const km of [5, 12]) Wk('DST', 'distance-drive-week', `Drive ${km} km this week`, `Cover ${km} km in a car over the week.`, km < 10 ? 'easy' : 'medium', { type: 'distance', mode: 'drive', metres: km * 1000 }, E);
  Wk('DST', 'distance-sail-week', 'Sail 3 km this week', 'Cover 3 km in a boat over the week.', 'medium', { type: 'distance', mode: 'sail', metres: 3000 }, E);

  // ---- fishing and boats (the daily cap is 120 Gold, FISH_DAILY_CAP)
  const fish = FISH.filter((f) => f.id !== 'boot');
  const plural = { minnow: 'minnows', perch: 'perch', trout: 'trout', pike: 'pike', eel: 'eels', koi: 'golden koi' };
  const an = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
  for (const f of fish) {
    const name = f.name.toLowerCase();
    (['koi', 'eel'].includes(f.id) ? Wk : D)('FSH', 'fish-kind', `Catch ${an(name)}`, `Reel in ${an(name)} (worth ${f.gold} Gold when caught).`, f.id === 'koi' ? 'hard' : ['pike', 'eel'].includes(f.id) ? 'medium' : 'easy', { type: 'catch', fish: f.id, count: 1 }, T);
    Wk('FSH', 'fish-kind-week', `Catch 3 ${plural[f.id]}`, `Reel in three ${plural[f.id]} over the week.`, f.id === 'koi' ? 'hard' : 'medium', { type: 'catch', fish: f.id, count: 3 }, T);
  }
  Wk('FSH', 'fish-boot', 'Reel in an old boot', 'Everyone catches one eventually. Reel in an old boot.', 'easy', { type: 'catch', fish: 'boot', count: 1 }, T);
  for (const n of [1, 3, 5, 8]) D('FSH', 'fish-count', `Catch ${n} fish`, `Reel in ${n} fish of any kind today.`, n < 3 ? 'easy' : n < 8 ? 'medium' : 'hard', { type: 'catch', count: n }, T);
  for (const n of [15, 30]) Wk('FSH', 'fish-count-week', `Catch ${n} fish this week`, `Reel in ${n} fish of any kind over the week.`, n < 20 ? 'medium' : 'hard', { type: 'catch', count: n }, T);
  for (const g of [20, 40, 60, 100]) D('FSH', 'fish-gold', `Earn ${g} Gold fishing`, `Fishing pays up to 120 Gold a day: earn ${g} of it today.`, g < 40 ? 'easy' : g < 100 ? 'medium' : 'hard', { type: 'fish-gold', gold: g }, T);
  Wk('FSH', 'fish-variety', 'Catch 4 kinds of fish', 'Catch four different kinds of fish over the week.', 'medium', { type: 'catch-kinds', kinds: 4 }, T);
  Wk('FSH', 'fish-variety', 'Catch 6 kinds of fish', 'Catch six different kinds of fish over the week.', 'hard', { type: 'catch-kinds', kinds: 6 }, T);
  for (const pier of W.piers) {
    D('FSH', 'fish-pier', `Fish from ${pier.name}`, `Cast a line from ${pier.name} and catch something.`, 'easy', { type: 'catch', place: 'pier', id: pier.id, count: 1 }, E, { seedBound: true });
    D('FSH', 'sail-pier', `Sail to ${pier.name}`, `Take a boat out and bring it in to ${pier.name}.`, 'medium', { type: 'dock', place: 'pier', id: pier.id }, E, { seedBound: true });
  }
  for (const lake of W.lakes) {
    D('FSH', 'fish-lake', `Fish on ${lake.name}`, `Catch a fish on ${lake.name}.`, 'easy', { type: 'catch', place: 'lake', id: lake.id, count: 1 }, E, { seedBound: true });
    D('FSH', 'sail-lake', `Sail across ${lake.name}`, `Take a boat from one shore of ${lake.name} to the other.`, 'medium', { type: 'sail-across', place: 'lake', id: lake.id }, E, { seedBound: true });
    Wk('FSH', 'fish-lake-week', `Catch 10 fish on ${lake.name}`, `Reel in ten fish on ${lake.name} over the week.`, 'hard', { type: 'catch', place: 'lake', id: lake.id, count: 10 }, E, { seedBound: true });
  }
  if (W.river) D('FSH', 'sail-river', `Sail up ${W.river.name}`, `Take a boat up ${W.river.name} as far as it goes.`, 'medium', { type: 'sail-along', place: 'river', id: W.river.id }, E, { seedBound: true });

  // ---- the daily finds (these exist today): the chest, the stars and the Plot of the Day
  D('HNT', 'chest', 'Open the mystery chest', 'Find today\'s chest on the pavement and open it.', 'easy', { type: 'chest' }, T);
  D('HNT', 'potd', 'Visit the Plot of the Day', 'Walk into today\'s Plot of the Day.', 'easy', { type: 'potd' }, T);
  for (const n of [1, 2, 3]) D('HNT', 'stars', n === 3 ? 'Find all three gold stars' : `Find ${n} gold star${n > 1 ? 's' : ''}`, n === 3 ? 'Collect all three of today\'s stars: the scavenger hunt\'s bonus on top.' : `Collect ${n} of today's three gold stars.`, n === 1 ? 'easy' : n === 2 ? 'medium' : 'hard', { type: 'stars', count: n }, T);
  D('HNT', 'combo', 'Chest, star and Plot of the Day', 'Open the chest, find a star and visit the Plot of the Day, all in one day.', 'hard', { type: 'all', of: [{ type: 'chest' }, { type: 'stars', count: 1 }, { type: 'potd' }] }, T);
  D('HNT', 'combo', 'Two stars before noon', 'Find two gold stars before the city clock reaches noon.', 'hard', { type: 'stars', count: 2, before: 12 }, E);
  for (const days of [3, 5, 7]) Wk('HNT', 'stars-week', `Find all three stars on ${days} days`, `Complete the scavenger hunt on ${days} different days this week.`, days < 5 ? 'medium' : 'hard', { type: 'hunt-won', days }, T);
  for (const days of [4, 6]) Wk('HNT', 'chest-week', `Open the chest on ${days} days`, `Open the mystery chest on ${days} different days this week.`, days < 5 ? 'easy' : 'medium', { type: 'chest', days }, T);
  for (const days of [3, 5]) Wk('HNT', 'potd-week', `Visit the Plot of the Day on ${days} days`, `Walk into the Plot of the Day on ${days} different days this week.`, days < 4 ? 'easy' : 'medium', { type: 'potd', days }, T);
  Wk('HNT', 'week-sweep', 'A full day: chest, three stars and the Plot of the Day', 'Do every daily find on the same day at least once this week.', 'hard', { type: 'all', of: [{ type: 'chest' }, { type: 'stars', count: 3 }, { type: 'potd' }], sameDay: true }, T);

  // ---- the community
  Wk('VOT', 'vote', 'Cast your Building of the Week vote', 'Use this week\'s vote on a building you like.', 'easy', { type: 'vote', count: 1 }, T, { requires: ['signed-in'] });
  Wk('VOT', 'vote', 'Use both votes', 'Win a day\'s hunt for the extra vote, then use both votes on different buildings.', 'hard', { type: 'vote', count: 2 }, T, { requires: ['signed-in'] });
  Wk('VOT', 'winner', 'Visit this week\'s Building of the Week', 'Walk into the building that won last week\'s vote.', 'easy', { type: 'visit-winner' }, T);
  for (let rank = 1; rank <= 5; rank++) Wk('VOT', 'leader', `Visit number ${rank} on the leaderboard`, `Walk into the building in position ${rank} of this week's vote.`, 'medium', { type: 'visit-leader', rank }, T);
  Wk('VOT', 'leader', 'Visit all five leaders', 'Walk into each of the five buildings leading this week\'s vote.', 'hard', { type: 'visit-leader', all: 5 }, T);
  for (const d of W.districts.filter((x) => W.businesses.some((b) => b.district === x.id))) Wk('VOT', 'vote-district', `Vote for a business in ${d.name}`, `Give this week's vote to a business in ${d.name}.`, 'easy', { type: 'vote', district: d.id }, T, { requires: ['signed-in'] });
  for (const c of ['Food & drink', 'Shops & retail', 'Software & SaaS', 'Games & play', 'Creators & studios', 'Online stores', 'Local services']) Wk('VOT', 'discover', `Browse ${c} on Discover`, `Open Discover and look through the ${c} category.`, 'easy', { type: 'browse-category', category: c }, E);

  // ---- named businesses: 200 of the city's own, chosen once and spread across the districts
  const picked = [...W.businesses].sort((a, b) => hash(`${seed}|biz|${a.id}`) - hash(`${seed}|biz|${b.id}`)).slice(0, 200).sort((a, b) => a.id - b.id);
  const seen = {};
  for (const b of picked) { const k = `${b.title}|${b.district}`; seen[k] = (seen[k] ?? 0) + 1; }
  for (const b of picked) {
    const where = W.label[b.district] ?? b.district;
    const same = seen[`${b.title}|${b.district}`] > 1 ? ` (plot ${b.id})` : ''; // the city reuses some names: the plot number tells two apart
    D('BIZ', 'business', `Pay ${b.title} a visit in ${where}${same}`, `Step inside ${b.title} in ${where}${same}.`, 'easy', { type: 'visit-business', plotId: b.id }, T, { seedBound: true });
  }
  void 0;

  // ---- estates
  const prime = W.businesses.filter((b) => b.prime), lux = W.businesses.filter((b) => b.luxury), grand = W.businesses.filter((b) => b.grand);
  if (prime.length) D('EST', 'prime', 'Visit a prime-site business', 'Walk into a business on one of the city\'s prime sites.', 'easy', { type: 'visit-businesses', flag: 'prime', count: 1 }, T);
  if (lux.length) D('EST', 'luxury', 'Visit a luxury estate', 'Walk into a business on a luxury plot.', 'medium', { type: 'visit-businesses', flag: 'luxury', count: 1 }, T);
  if (grand.length) D('EST', 'grand', 'Visit a grand estate', 'Walk up to the door of a grand estate.', 'hard', { type: 'visit-businesses', flag: 'grand', count: 1 }, T);
  if (lux.length >= 3) Wk('EST', 'luxury-week', 'Visit 3 luxury estates', 'Step inside three different luxury plots this week.', 'medium', { type: 'visit-businesses', flag: 'luxury', count: 3, distinct: true }, T);
  if (grand.length >= 4) Wk('EST', 'grand-week', `Visit ${Math.min(grand.length, 8) >= 8 ? 'all 8' : grand.length} grand estates`, `Visit ${grand.length >= 8 ? 'every one of the 8' : `${grand.length}`} grand estates over the week.`, 'hard', { type: 'visit-businesses', flag: 'grand', count: Math.min(grand.length, 8), distinct: true }, T);
  for (const d of W.districts) if (prime.some((b) => b.district === d.id)) D('EST', 'prime-district', `Visit a prime site in ${d.name}`, `Walk into a prime-site business in ${d.name}.`, 'medium', { type: 'visit-businesses', flag: 'prime', district: d.id, count: 1 }, T);

  // ---- sound zones, the fun park and the malls
  for (const [id, z] of Object.entries(ZONES)) {
    D('SND', 'zone-enter', `Walk into the ${z.label} sound zone`, `Find where the ${z.label} sound starts and walk into it.`, 'easy', { type: 'zone', zone: id }, P);
    D('SND', 'zone-stay', `Listen to ${z.label} for a minute`, `Stand in the ${z.label} sound zone for a full minute.`, 'medium', { type: 'zone', zone: id, seconds: 60 }, P);
  }
  Wk('SND', 'zone-week', 'Hear 5 different sound zones', 'Walk through five different sound zones this week.', 'medium', { type: 'zones', count: 5 }, P);
  Wk('SND', 'zone-week', 'Hear every sound zone', 'Walk through all eleven sound zones this week.', 'hard', { type: 'zones', count: 11 }, P);
  if (W.funPark) {
    for (const ride of ['Ferris wheel', 'Carousel', 'Swings', 'Bumper cars']) D('FUN', 'ride', `Walk up to the ${ride.toLowerCase()}`, `Find the ${ride.toLowerCase()} in ${W.funPark.name} and stand beside it.`, 'easy', { type: 'reach', place: 'ride', ride: ride.toLowerCase() }, P, { seedBound: true });
    Wk('FUN', 'ride-week', 'Visit all four rides', `Stand beside every ride in ${W.funPark.name} this week.`, 'medium', { type: 'reach', place: 'rides', count: 4 }, P, { seedBound: true });
  }
  for (const m of W.malls) {
    D('FUN', 'mall-shops', `Step inside 3 shops in ${m.name}`, `Walk into three different shops in ${m.name}.`, 'medium', { type: 'visit-businesses', place: 'mall', id: m.id, count: 3 }, E, { seedBound: true });
  }

  // ---- the air
  for (const a of W.airports) {
    D('AIR', 'airport-plane', `Watch a plane at ${a.name}`, `Stand by the runway at ${a.name} until a plane goes by.`, 'easy', { type: 'watch-plane', id: a.id }, E, { seedBound: true });
    D('AIR', 'fly-takeoff', `Take off from ${a.name}`, `Get a plane into the air from ${a.name}.`, 'hard', { type: 'takeoff', id: a.id }, E, { seedBound: true });
    D('AIR', 'fly-land', `Land at ${a.name}`, `Bring a plane down on the runway at ${a.name}.`, 'hard', { type: 'land', id: a.id }, E, { seedBound: true });
  }
  D('AIR', 'fly-time', 'Fly for 2 minutes', 'Spend two minutes in the air.', 'medium', { type: 'fly', seconds: 120 }, E);
  Wk('AIR', 'fly-week', 'Land at both airports', 'Bring a plane down at each of the two airports this week.', 'hard', { type: 'land', all: true }, E);

  // ---- the wardrobe (needs the item: free ones are in everyone's wardrobe)
  const wear = COSMETICS.filter((c) => c.slot !== 'emote');
  const shirts = wear.filter((c) => c.slot === 'shirt'), pants = wear.filter((c) => c.slot === 'pants'), hats = wear.filter((c) => c.slot === 'hat' && c.id !== 'hat-none');
  for (const c of wear.filter((x) => x.price > 0)) D('WRD', 'wear', `Wear the ${c.name.toLowerCase()}`, `Put on the ${c.name.toLowerCase()} and walk around in it.`, 'easy', { type: 'wear', item: c.id }, T, { requires: ['owns-item'] });
  for (const s of shirts) for (const p of pants) Wk('WRD', 'outfit', `${s.name} with ${p.name.toLowerCase()}`, `Wear the ${s.name.toLowerCase()} with the ${p.name.toLowerCase()} for a day.`, 'easy', { type: 'wear', items: [s.id, p.id] }, T, { requires: ['owns-item'] });
  const outfits = [];
  for (const s of shirts) for (const p of pants) for (const h of hats) outfits.push([s, p, h]);
  outfits.sort((a, b) => hash(`${seed}|outfit|${a.map((x) => x.id)}`) - hash(`${seed}|outfit|${b.map((x) => x.id)}`));
  for (const [s, p, h] of outfits.slice(0, 30)) Wk('WRD', 'outfit-hat', `${h.name}, ${s.name.toLowerCase()} and ${p.name.toLowerCase()}`, `Wear the ${h.name.toLowerCase()}, the ${s.name.toLowerCase()} and the ${p.name.toLowerCase()} together.`, 'medium', { type: 'wear', items: [s.id, p.id, h.id] }, T, { requires: ['owns-item'] });
  for (const e of COSMETICS.filter((c) => c.slot === 'emote')) for (const n of [3, 10]) D('WRD', 'emote', `${e.name} ${n} times`, `Play the ${e.name.toLowerCase()} emote ${n} times today (key ${e.key}).`, n < 5 ? 'easy' : 'medium', { type: 'emote', emote: e.id, count: n }, E, { requires: ['owns-item'] });
  for (const park of W.parks) D('WRD', 'emote-place', `Dance in ${park.name}`, `Play the dance emote in ${park.name}.`, 'easy', { type: 'emote', emote: 'emote-dance', place: 'park', id: park.id }, E, { requires: ['owns-item'], seedBound: true });
  Wk('WRD', 'emote-week', 'Play every emote', 'Play each emote you own at least five times this week.', 'medium', { type: 'emote', all: true, count: 5 }, E, { requires: ['owns-item'] });

  // ---- other players
  for (const d of W.districts) D('SOC', 'chat-district', `Say hello in ${d.name}`, `Send a friendly message in Nearby chat while you are in ${d.name}.`, 'easy', { type: 'chat', district: d.id, count: 1 }, E, { requires: ['signed-in'] });
  for (const park of W.parks) D('SOC', 'wave-place', `Wave at someone in ${park.name}`, `Play the wave emote near another player in ${park.name}.`, 'easy', { type: 'emote', emote: 'emote-wave', near: 'player', place: 'park', id: park.id }, E, { requires: ['owns-item'], seedBound: true });
  for (const n of [2, 4, 6]) D('SOC', 'meet', `Meet ${n} other players`, `Be within a few steps of ${n} different players today.`, n < 4 ? 'easy' : 'medium', { type: 'meet', count: n }, E);
  for (const n of [10, 20]) Wk('SOC', 'meet-week', `Meet ${n} players this week`, `Be near ${n} different players over the week.`, n < 15 ? 'medium' : 'hard', { type: 'meet', count: n }, E);
  Wk('SOC', 'private', 'Start a private conversation', 'Message a player privately (Message privately, in their chat menu).', 'medium', { type: 'private-message', count: 1 }, E, { requires: ['signed-in'] });

  // ---- for people who list or own a business (no Gold for the survey)
  const own = [
    ['Update your offer', 'Check that your storefront\'s offer is what you want visitors to see.', 'storefront'],
    ['Add or change your logo', 'Give your storefront a logo, or refresh the one you have.', 'logo'],
    ['Write a better description', 'Say in a sentence or two what you do and who it is for.', 'description'],
    ['Set one clear call to action', 'Choose the one thing a visitor should do: order, book or visit your website.', 'cta'],
    ['Read your 30-day figures', 'Open your figures and look at views, visits and where visitors came from.', 'figures'],
    ['Make a tagged campaign link', 'Make a link with a campaign name, so you can see what it brings.', 'campaign'],
    ['Check your business page on a phone', 'Open your public page on your phone and see that it reads well.', 'mobile'],
    ['Link your building to your page', 'Connect your building in the city to your business page.', 'link'],
    ['Look at your neighbours', 'Walk to the businesses either side of yours and see what they offer.', 'neighbours'],
    ['Walk into your own storefront', 'Visit your storefront as a visitor would.', 'self-visit'],
  ];
  for (const [title, text, key] of own) Wk('OWN', key, title, text, 'easy', { type: 'owner', action: key }, E, { requires: ['owns-listing'] });
  Wk('OWN', 'checkin', 'Answer the weekly check-in', 'Tell us how VoxelVenture did for you this week (four short questions). No Gold: the answers should not be bought.', 'easy', { type: 'owner', action: 'pilot-checkin' }, E, { requires: ['owns-listing'], gold: 0 });
  for (const d of W.districts.filter((x) => ['saas', 'creator', 'bazaar', 'arcade'].includes(x.id))) Wk('OWN', 'district-page', `Look at the ${d.name} page`, `Open the public page for ${d.name} and see where your business appears.`, 'easy', { type: 'owner', action: 'district-page', district: d.id }, E, { requires: ['owns-listing'] });

  // ---- streaks and collections
  for (const n of [2, 3, 5, 7]) Wk('STR', 'daily-streak', `Finish all 3 daily tasks on ${n} days`, `Complete the day's three tasks on ${n} different days this week.`, n < 4 ? 'medium' : 'hard', { type: 'tasks-complete', cadence: 'daily', all: true, days: n }, E);
  for (const n of [5, 10, 15]) Wk('STR', 'daily-count', `Finish ${n} daily tasks this week`, `Complete ${n} daily tasks over the week.`, n < 10 ? 'easy' : n < 15 ? 'medium' : 'hard', { type: 'tasks-complete', cadence: 'daily', count: n }, E);
  for (const n of [3, 5, 7, 14, 30]) Wk('STR', 'login-streak', `Keep a ${n}-day streak`, `Finish at least one daily task on ${n} days in a row.`, n < 7 ? 'easy' : n < 14 ? 'medium' : 'hard', { type: 'streak', days: n }, E);
  for (const g of [100, 200, 400]) Wk('STR', 'gold-week', `Earn ${g} Gold from tasks`, `Earn ${g} Gold from daily and weekly tasks this week.`, g < 200 ? 'easy' : g < 400 ? 'medium' : 'hard', { type: 'task-gold', gold: g }, E);
  for (const n of [3, 5, 7, 10]) Wk('COL', 'districts', `Visit ${n} districts`, `Step inside a business in ${n} different districts this week.`, n < 5 ? 'easy' : n < 10 ? 'medium' : 'hard', { type: 'districts', count: n }, T);
  Wk('COL', 'themed', 'Visit all four themed districts', 'Step inside a business in SaaS Silicon Strip, Creator Commons, The Bazaar and Arcade Alley.', 'medium', { type: 'districts', ids: ['saas', 'creator', 'bazaar', 'arcade'] }, T);
  Wk('COL', 'types', 'One of every kind', 'Step inside a shop, a restaurant and an office in the same week.', 'easy', { type: 'visit-types', types }, T);
  Wk('COL', 'bridges', `Cross all ${W.bridges.length} bridges`, 'Walk across every bridge in the city this week.', 'hard', { type: 'reach', place: 'bridge', all: true }, P, { seedBound: true });
  Wk('COL', 'piers', `See all ${W.piers.length} piers`, 'Walk out to the end of every pier this week.', 'medium', { type: 'reach', place: 'pier', all: true }, P, { seedBound: true });
  Wk('COL', 'waters', 'Both parks and both lakes', 'Visit each park and each lake in the city this week.', 'medium', { type: 'reach', place: ['park', 'lake'], all: true }, P, { seedBound: true });
  Wk('COL', 'landmark-kinds', 'One of every landmark', 'Visit a park, a lake, a bridge, an airport, a mall, a pier and the fun park this week.', 'hard', { type: 'reach', place: ['park', 'lake', 'bridge', 'airport', 'mall', 'pier', 'funpark'], oneOfEach: true }, P, { seedBound: true });
  Wk('COL', 'stars-places', 'Stars in three different kinds of place', 'Find gold stars at three different kinds of landmark this week.', 'hard', { type: 'stars-places', kinds: 3 }, E);

  // ---- challenges: the hard daily slot (combinations of the places, roads and fish above)
  const pick = (list, n, salt) => [...list].sort((a, b) => hash(`${seed}|${salt}|${a}`) - hash(`${seed}|${salt}|${b}`)).slice(0, n);
  for (const d of W.districts) if (W.businesses.filter((b) => b.district === d.id).length >= 4) D('CHL', 'district-four', `Step inside 4 businesses in ${d.name}`, `Walk into four different businesses in ${d.name} in one day.`, 'hard', { type: 'visit-businesses', district: d.id, count: 4, distinct: true }, T);
  for (const n of [3, 4, 5]) D('CHL', 'districts-day', `Visit ${n} districts in a day`, `Step inside a business in ${n} different districts today.`, 'hard', { type: 'districts', count: n }, T);
  for (let i = 0; i < W.bridges.length; i++) for (let j = i + 1; j < W.bridges.length; j++) D('CHL', 'bridge-pair', `Cross ${W.bridges[i].name} and ${W.bridges[j].name}`, `Walk across both ${W.bridges[i].name} and ${W.bridges[j].name} today.`, 'hard', { type: 'reach', place: 'bridge', ids: [W.bridges[i].id, W.bridges[j].id] }, P, { seedBound: true });
  const roadPairs = [];
  for (let i = 0; i < W.roads.length; i++) for (let j = i + 1; j < W.roads.length; j++) roadPairs.push([W.roads[i], W.roads[j]]);
  for (const [a, b] of pick(roadPairs.map((x) => x.join('|')), 24, 'roads').map((x) => x.split('|'))) D('CHL', 'road-pair', `Walk ${a} and ${b}`, `Walk the full length of ${a} and of ${b} today.`, 'hard', { type: 'road', roads: [a, b], mode: 'walk' }, P, { seedBound: true });
  for (let i = 0; i < fish.length; i++) for (let j = i + 1; j < fish.length; j++) D('CHL', 'fish-pair', `Catch ${an(fish[i].name.toLowerCase())} and ${an(fish[j].name.toLowerCase())}`, `Reel in ${an(fish[i].name.toLowerCase())} and ${an(fish[j].name.toLowerCase())} on the same day.`, fish[i].id === 'koi' || fish[j].id === 'koi' ? 'hard' : 'hard', { type: 'catch-all', fish: [fish[i].id, fish[j].id] }, T);
  const sights = places.filter((x) => ['park', 'lake', 'airport', 'mall', 'funpark'].includes(x.kind));
  const sightPairs = [];
  for (let i = 0; i < sights.length; i++) for (let j = i + 1; j < sights.length; j++) sightPairs.push([sights[i], sights[j]]);
  for (const k of pick(sightPairs.map((_, i) => String(i)), 16, 'sights')) { const [a, b] = sightPairs[Number(k)]; D('CHL', 'sight-pair', `Visit ${a.name} and ${b.name}`, `Be at ${a.name} and at ${b.name} on the same day.`, 'hard', { type: 'reach', ids: [a.id, b.id], both: true }, P, { seedBound: true }); }
  for (const phase of ['dawn', 'dusk', 'night']) D('CHL', 'phases', `Three districts ${phase === 'dawn' ? 'at dawn' : phase === 'dusk' ? 'at dusk' : 'after dark'}`, `Be in three different districts ${phase === 'dawn' ? 'at dawn' : phase === 'dusk' ? 'at dusk' : 'after dark'} in one day.`, 'hard', { type: 'be-in', phase, districts: 3 }, P);
  D('CHL', 'walk-far', 'Walk from one end of the city to the other', 'Walk from the far west of the city to the far east in one day.', 'hard', { type: 'cross-city', axis: 'x' }, P);
  D('CHL', 'walk-far', 'Walk from north to south', 'Walk from the far north of the city to the far south in one day.', 'hard', { type: 'cross-city', axis: 'z' }, P);

  const counts = {};
  for (const t of tasks) { counts.total = (counts.total ?? 0) + 1; counts[t.cadence] = (counts[t.cadence] ?? 0) + 1; }
  return { version: 1, seed, builtFrom: 'scripts/tasks/build-task-catalogue.mjs', gold: GOLD, counts, tasks };
}

const csvCell = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (cat) => ['id,cadence,category,family,tier,gold,signal,requires,seedBound,title,text,goal', ...cat.tasks.map((t) => [t.id, t.cadence, t.category, t.family, t.tier, t.gold, t.signal, t.requires.join('+'), t.seedBound, t.title, t.text, t.goal].map(csvCell).join(','))].join('\n') + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--seed');
  const cat = await buildCatalogue(i >= 0 ? Number(process.argv[i + 1]) : 20260101);
  const dir = path.join(root, 'docs', 'product');
  fs.writeFileSync(path.join(dir, 'task_catalogue.json'), JSON.stringify(cat, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'task_catalogue.csv'), toCsv(cat));
  const by = (key) => Object.entries(cat.tasks.reduce((m, t) => ((m[t[key]] = (m[t[key]] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' | ');
  console.log(`${cat.counts.total} tasks (${cat.counts.daily} daily, ${cat.counts.weekly} weekly), seed ${cat.seed}`);
  console.log('by category :', by('category'));
  console.log('by tier     :', by('tier'));
  console.log('by signal   :', by('signal'));
}
