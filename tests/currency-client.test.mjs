// The page owns no value when a game server holds the Gold (lib/data/game.js, lib/state/store.js; docs/architecture/backend.md, "Currency"): its Gold actions hand over to the
// server and never change the balance themselves, and nothing of value is saved to or restored from the browser. Without a server the local demo is unchanged.
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// the store saves through window.localStorage: a stand-in while it loads, so its save and restore rules can be read (zustand exposes them only with a storage)
const memory = new Map();
globalThis.window = { localStorage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) } };
const { useCityStore, hooks } = await imp('state/store.js');
delete globalThis.window;
const { dailyChest, plotOfTheDay } = await imp('game/daily.js');
const store = () => useCityStore.getState();
const live = (on) => { if (on) process.env.NEXT_PUBLIC_LIVE_API_URL = 'https://api.test'; else delete process.env.NEXT_PUBLIC_LIVE_API_URL; };

// ---- without a game server the demo works as before (and says it is a demo)
live(false);
useCityStore.setState({ day: '2026-11-15', gold: 0, daily: { chestDay: null, potdDay: null, huntDay: null, huntFound: [] } });
const demoChest = dailyChest(store().layout.intersections, store().layout.seed, '2026-11-15');
check('with no server, the demo\'s chest pays locally, as before', store().openDailyChest() === demoChest.gold && store().gold === demoChest.gold);

// ---- with a game server, every Gold action goes to the server and the page adds nothing
live(true);
const calls = [];
hooks.game = {
  chest: () => calls.push('chest'), star: (i) => calls.push(`star${i}`), fish: () => calls.push('fish'), potd: (p) => calls.push(`potd${p.id}`),
  billboardStart: (id) => calls.push(`start${id}`), billboardComplete: (id) => calls.push(`complete${id}`),
  buy: (item) => { calls.push(`buy${item.id}`); return Promise.resolve(true); }, equip: (slot, id) => calls.push(`equip${slot}:${id}`), raffle: () => { calls.push('raffle'); return Promise.resolve(0); },
};
useCityStore.setState({ day: '2026-11-15', gold: 0, owned: { 'shirt-blue': true, 'pants-navy': true, 'hat-none': true, 'hat-top': true }, daily: { chestDay: null, potdDay: null, huntDay: null, huntFound: [] }, completedQuests: {}, brandQuests: {} });
store().openDailyChest();
store().collectHuntStar(0);
store().collectHuntStar(1);
store().catchFish({ id: 'koi', name: 'Golden koi', gold: 40 });
store().buyCosmetic('hat-crown');
store().equipCosmetic('hat-top');
await store().enterRaffle();
store().completeBillboardQuest('b1');
store().startBillboardQuest('b1');
const potd = plotOfTheDay(store().plots, store().layout.seed, '2026-11-15');
store().openInterior(potd);
const brandPlot = store().plots.find((p) => p.brand?.quest && !p.userClaimed);
const brandPaid = brandPlot ? store().completeBrandQuest(brandPlot.id) : 0;
check('every Gold action handed over to the server: chest, two stars, a fish, a purchase, wearing an item, a raffle ticket, an ad quest, the Plot of the Day', ['chest', 'star0', 'star1', 'fish', 'buyhat-crown', 'equiphat:hat-top', 'raffle', 'completeb1', 'startb1', `potd${potd.id}`].every((c) => calls.includes(c)), calls.join(','));
check('and the page\'s own balance did not move by a single Gold', store().gold === 0);
check('a business\'s visit reward is not paid by the page (the server\'s Credits quest pays it)', brandPaid === 0 && store().gold === 0 && !Object.keys(store().brandQuests).length);
check('what is owned and worn did not change on the page either', !store().owned['hat-crown'] && store().appearance.hat !== 'hat-crown');

// ---- nothing of value is kept in the browser, and an old saved balance is never restored
const options = useCityStore.persist.getOptions();
const saved = options.partialize(store());
check('the saved game holds no Gold, no inventory, no daily progress and no quests when a server holds them', !['gold', 'owned', 'appearance', 'daily', 'completedQuests', 'brandQuests', 'fishing'].some((k) => k in saved));
const merged = options.merge({ seed: store().layout.seed, gold: 999999, owned: { 'hat-crown': true }, appearance: { hat: 'hat-crown' }, daily: { chestDay: '2026-11-15', huntFound: [0, 1, 2] }, completedQuests: { b1: true }, fishing: { caught: { koi: 99 }, day: '2026-11-15', goldToday: 120 } }, store());
check('a balance edited into the browser\'s saved game is ignored: 999999 Gold, an owned crown and a won hunt are not restored', merged.gold === 0 && !merged.owned['hat-crown'] && merged.appearance.hat !== 'hat-crown' && !merged.daily.huntFound.length && !Object.keys(merged.completedQuests).length && !merged.fishing.caught.koi);

// ---- without a server the saved game still works (the demo)
live(false);
const demoSaved = options.partialize(store());
check('with no server the demo keeps its Gold in the browser, as before', ['gold', 'owned', 'daily'].every((k) => k in demoSaved));
check('and restores it', options.merge({ seed: store().layout.seed, gold: 77 }, store()).gold === 77);

hooks.game = null;
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
