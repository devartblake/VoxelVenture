// The game's Gold, held by the server (services/api/gold.mjs; docs/architecture/backend.md, "Currency"). With a game server (NEXT_PUBLIC_LIVE_API_URL) the page owns no value:
// it says what happened ("I reached the chest", "a fish bit") and shows whatever balance the server answers with. The store's Gold actions call these through `hooks.game`
// (installed by installGame), so lib/state/store.js never imports the API. Without a server the store keeps its local, clearly demo behaviour.
import { avatarState } from '../sim/avatarState';
import { hooks, useCityStore } from '../state/store';
import { useAccount } from '../state/accountStore';
import { apiOn, getToken, request } from './api';

const here = () => ({ x: avatarState.x, z: avatarState.z });
const note = (text) => useCityStore.getState().notify(text);
const signedIn = () => Boolean(getToken());
const GUEST = 'Sign in to keep your Gold: guests earn nothing here.';

// what the server says goes straight into the page's state: the page never adds to it
function apply(s) {
  if (!s || s.signedIn === false) return useCityStore.setState({ gameSignedIn: false, gold: 0, day: s?.day ?? useCityStore.getState().day });
  useCityStore.setState({
    gameSignedIn: true, gold: s.gold, credits: s.credits, owned: s.owned, appearance: s.appearance, daily: { ...useCityStore.getState().daily, ...s.daily }, fishing: s.fishing,
    completedQuests: s.completedQuests ?? {}, day: s.day,
  });
}
const update = (r) => r && typeof r.gold === 'number' && useCityStore.setState({ gold: r.gold });

// "You are not close enough", "You have that star already": the server's words, shown quietly
const refused = (e) => { if (e?.code !== 'already_done') note(e?.message || 'That did not work.'); };

export const gameLedgerRemote = () => request('GET', '/game/ledger?limit=30');
export const loadGame = () => request('GET', '/game/state').then(apply).catch(() => {});

async function claim(path, body, text) {
  if (!signedIn()) return note(GUEST), null;
  try {
    const r = await request('POST', path, body);
    update(r);
    if (r.paid > 0) note(text(r));
    return r;
  } catch (e) {
    refused(e);
    return null;
  }
}

export function installGame() {
  if (!apiOn()) return;
  useCityStore.setState({ gameLive: true });
  hooks.game = {
    chest: () => claim('/game/chest', here(), (r) => `Daily chest: +${r.paid} Gold`).then(() => loadGame()),
    potd: (plot) => claim('/game/potd', { plotId: plot.id, ...here() }, (r) => `Plot of the Day! +${r.paid} Gold for visiting ${plot.title}`).then(() => loadGame()),
    star: (index) => claim('/game/star', { index, ...here() }, (r) => (r.all ? `All 3 stars found: +${r.paid} Gold` : `Gold star ${r.found.length} of 3: +${r.paid} Gold`)).then((r) => { if (r?.all) hooks.onHuntComplete?.(r.day); return loadGame(); }),
    fish: async () => {
      if (!signedIn()) return note(GUEST);
      try {
        const r = await request('POST', '/game/fish', { castId: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` });
        update(r);
        note(r.paid > 0 ? `You caught a ${r.fish.name.toLowerCase()}! +${r.paid} Gold` : r.capped ? `You caught a ${r.fish.name.toLowerCase()}. Fishing has paid its daily limit.` : `You reeled in ${/^[aeiou]/i.test(r.fish.name) ? 'an' : 'a'} ${r.fish.name.toLowerCase()}.`);
        return loadGame();
      } catch (e) { return refused(e); }
    },
    billboardStart: (id) => (signedIn() ? request('POST', '/game/billboard/start', { billboardId: id }).catch(() => {}) : null),
    billboardComplete: (id) => claim('/game/billboard/complete', { billboardId: id }, (r) => `Quest complete! +${r.paid} Gold`).then(() => loadGame()),
    buy: (item) => claim('/game/shop/buy', { itemId: item.id }, () => `Bought ${item.name}`).then((r) => { if (r) useCityStore.setState({ owned: r.owned, appearance: r.appearance }); return Boolean(r); }),
    equip: (slot, id) => request('POST', '/game/appearance', { [slot]: id }).then((r) => useCityStore.setState({ appearance: r.appearance })).catch(refused),
    raffle: async () => {
      if (!signedIn()) return note(GUEST), null;
      try {
        const r = await request('POST', '/game/raffle', {});
        update(r);
        note(r.prize ? `Raffle win: +${r.prize} Gold!` : 'No luck this time.');
        return r.prize;
      } catch (e) { return refused(e), null; }
    },
  };
  loadGame();
  // signing in or out changes whose Gold this is: ask the server again
  useAccount.subscribe((state, before) => { if ((state.account?.id ?? null) !== (before.account?.id ?? null)) loadGame(); });
}
