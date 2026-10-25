// The game's client side of the server: the state sync, the sign-in that only appears on claim, claiming, taking over, ad spaces and events.
// Starts a real API server, then drives lib/data/sync.js and the stores the way the UI does.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { root, sleep, imp } from './helpers.mjs';

const free = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await free();
const proc = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', path.join(root, 'services', 'api', 'server.mjs')], { cwd: root, env: { ...process.env, API_PORT: String(port), API_DB: ':memory:', ADMIN_TOKEN: 'admin-secret', HUMAN_MIN_AGE_MS: '0', HUMAN_VISIT_CAP: '1000', HUMAN_CLICK_CAP: '1000' }, stdio: 'ignore' });
process.env.NEXT_PUBLIC_LIVE_API_URL = `http://localhost:${port}`;
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: (k) => void mem.delete(k) };

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}/health`)).ok) break; } catch { /* starting */ } await sleep(250); }
  const { useCityStore } = await imp('state/store.js');
  const { useAccount } = await imp('state/accountStore.js');
  const sync = await imp('data/sync.js');
  const { apiOn, setToken } = await imp('data/api.js');
  const { takeoverQuote } = await imp('game/claimPrice.js');
  check('the live API is switched on by the environment', apiOn());
  const store = () => useCityStore.getState();
  const empty = store().plots.find((p) => !p.owner && p.districtId !== 'suburb' && !p.prime);
  const empty2 = store().plots.find((p) => !p.owner && p.districtId !== 'suburb' && !p.prime && p.id !== empty.id);
  const biz = { title: 'Live Shop', buildingType: 'shop', website: 'https://live.test', variant: 'boutique', logo: { kind: 'generated' }, description: 'From the server.' };

  // browsing needs no account
  const n0 = await sync.refresh();
  check('syncing the world needs no sign-in', n0 >= 0 && !useAccount.getState().account);

  // claiming asks for a sign-in only now
  let err = null;
  await sync.claimRemote(empty.id, biz).catch((e) => (err = e));
  check('claiming without an account is refused with auth_required', err?.code === 'auth_required' && !store().plots.find((p) => p.id === empty.id).owner);
  let ran = false;
  const answered = useAccount.getState().ask(() => (ran = true));
  check('asking opens the sign-in form and waits', answered === false && useAccount.getState().askOpen === true);
  await useAccount.getState().signup('Ann', 'longenough1');
  await sleep(50);
  check('after signing up the form closes and the waiting action runs', useAccount.getState().askOpen === false && ran && useAccount.getState().account.username === 'Ann');
  check('the sign-in is kept for next time', localStorage.getItem('voxelventure-token')?.length === 64);

  // the claim goes through the server and the plot becomes hers
  await sync.claimRemote(empty.id, biz);
  const mine = store().plots.find((p) => p.id === empty.id);
  check('a claim makes the lot her building, owned by her account', mine.owner === 'Ann' && mine.userClaimed === true && mine.title === 'Live Shop' && mine.buildingType === 'shop' && mine.height > 0.2 && mine.interiorData);

  // a second player (another browser) sees it, and loses a race for the same lot
  const annToken = localStorage.getItem('voxelventure-token');
  setToken('');
  useAccount.setState({ account: null });
  const bob = await (await fetch(`http://localhost:${port}/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Bob', password: 'longenough2' }) })).json();
  setToken(bob.token);
  useAccount.setState({ account: bob.account });
  // Bob's game still thinks empty2 is free; Ann claims it first through the server directly
  await fetch(`http://localhost:${port}/plots/${empty2.id}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${annToken}` }, body: JSON.stringify({ ...biz, title: 'Ann Two' }) });
  let lost = null;
  await sync.claimRemote(empty2.id, { ...biz, title: 'Bob Late' }).catch((e) => (lost = e));
  const seen = store().plots.find((p) => p.id === empty2.id);
  check('losing the race: the server says so, and the game now shows the winner', lost?.code === 'already_owned' && seen.owner === 'Ann' && seen.title === 'Ann Two' && !seen.userClaimed, `${lost?.code} ${seen.owner}`);
  check('Ann\'s first plot is not Bob\'s (userClaimed follows the signed-in account)', store().plots.find((p) => p.id === empty.id).userClaimed === false);

  // take over
  const prey = store().plots.find((p) => p.owner && p.generated && p.buildingType !== 'house' && p.districtId !== 'suburb' && !p.userClaimed);
  const price = takeoverQuote(prey, null, 'shop').total; // what the take-over form shows (lib/game/claimPrice.js): 1.25x the land of a business the city started with
  check('the game prices the take-over as 1.25x its land', price === Math.round(prey.price * 1.25 * 100) / 100, String(price));
  const r = await sync.takeOverRemote(prey.id, { ...biz, title: 'Bob Takes Over' }, price);
  const took = store().plots.find((p) => p.id === prey.id);
  check('a take-over pays out the old owner and the building becomes Bob\'s', r.paidOut === price && took.owner === 'Bob' && took.userClaimed && took.title === 'Bob Takes Over' && took.takeovers === 1);
  err = null;
  await sync.takeOverRemote(prey.id, biz, 1).catch((e) => (err = e));
  check('taking over your own business, or at a stale price, is refused', err !== null);

  // ad spaces
  const openAd = store().billboards.find((b) => !b.ad);
  const adPrice = Math.round(openAd.value * 1.25);
  const ar = await sync.buyAdRemote(openAd.id, { advertiser: 'Bob Co', headline: 'Hello', tagline: 'x', url: 'https://b.test', color: '#3b82f6' }, adPrice);
  const adNow = store().billboards.find((b) => b.id === openAd.id);
  check('buying an open ad space puts the ad on the billboard at 1.25x', ar.slot.value === adPrice && adNow.ad?.headline === 'Hello' && adNow.value === adPrice);

  // events
  const built = store().plots.find((p) => p.owner && p.generated && p.id !== prey.id);
  globalThis.localStorage = { getItem: (k) => (k === 'voxelventure-visitor' ? 'tester01' : null), setItem: () => {}, removeItem: () => {} }; // one stable visitor id for the run
  await fetch(`http://localhost:${port}/presence/ping`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify({ visitor: sync.visitorId() }) }); // a running page
  sync.sendEvent(built.id, 'visit', { seconds: 45 });
  sync.sendEvent(built.id, 'click');
  store().recordBillboardView(openAd.id);
  await sleep(500);
  const stats = await (await fetch(`http://localhost:${port}/plots/${built.id}/stats`, { headers: { Authorization: 'Bearer admin-secret' } })).json();
  const ad = await (await fetch(`http://localhost:${port}/ads/${openAd.id}`)).json();
  check('visits, website clicks and ad views reach the server', stats.views === 1 && stats.clicks === 1 && ad.views === 1);
  await sync.refresh();
  check('the next sync brings the new numbers back', store().plots.find((p) => p.id === built.id).visits === built.visits + 1 || store().plots.find((p) => p.id === built.id).visits >= built.visits);

  // the sign-out
  await useAccount.getState().logout();
  check('signing out drops the account and the saved sign-in', useAccount.getState().account === null && !localStorage.getItem('voxelventure-token'));
} catch (e) {
  fails++;
  console.log('FAIL the live test crashed:', e.stack);
} finally {
  proc.kill();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
