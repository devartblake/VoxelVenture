// The page's side of the tasks (lib/data/tasks.js, lib/state/taskStore.js): it only SHOWS what the server says. It sends nothing but the task in the address when collecting (no
// progress, no "done", no amount), takes the balance from the server's answer, and tells the player in the server's own words when a task is not done. Guests collect nothing.
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

const memory = new Map();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) } } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: globalThis.window.localStorage });
process.env.NEXT_PUBLIC_LIVE_API_URL = 'https://api.test';

const { useCityStore } = await imp('state/store.js');
const { useTasks } = await imp('state/taskStore.js');
const tasks = await imp('data/tasks.js');

const task = (id, have, collected = null) => ({ id, cadence: 'daily', category: 'EXP', family: 'x', title: `Task ${id}`, text: 'Do it.', tier: 'easy', gold: 5, period: '2026-11-18', progress: { have, need: 2, done: have >= 2 }, collected });
let tasksNow = { signedIn: true, day: '2026-11-18', week: '2026-11-16', daily: [task('D-EXP-aaaaaaaa', 1), task('D-EXP-bbbbbbbb', 0), task('D-EXP-cccccccc', 0)], weekly: [], summary: { collected: 0, offered: 3, gold: 0 } };
const sent = [];
let claimAnswer = { status: 200, body: { paid: 5, gold: 47, task: { id: 'D-EXP-aaaaaaaa', title: 'Task D-EXP-aaaaaaaa', tier: 'easy', gold: 5 }, period: '2026-11-18', progress: { have: 2, need: 2, done: true } } };
globalThis.fetch = async (url, init = {}) => {
  sent.push({ url: String(url), method: init.method, body: init.body });
  const path = String(url).replace('https://api.test', '');
  if (path === '/tasks') return { ok: true, status: 200, json: async () => tasksNow };
  if (path.startsWith('/me/tasks')) return { ok: true, status: 200, json: async () => ({ claims: [], next: null, totals: { collected: 0, gold: 0, bestStreak: 0, currentStreak: 0, byCategory: {}, byCadence: {} } }) };
  if (/^\/tasks\/.+\/claim$/.test(path)) return { ok: claimAnswer.status < 300, status: claimAnswer.status, json: async () => claimAnswer.body };
  return { ok: false, status: 404, json: async () => ({}) };
};

// ---- guests
const toasts = [];
useCityStore.subscribe((s) => { if (s.toast) toasts.push(s.toast.text); });
await tasks.loadTasks();
check('the page shows exactly what the server answered', useTasks.getState().data.daily.length === 3 && useTasks.getState().data.daily[0].progress.have === 1);
const before = sent.length;
check('a guest cannot collect: nothing is sent', (await tasks.collectTask('D-EXP-aaaaaaaa')) === null && sent.length === before);

// ---- signed in
memory.set('voxelventure-token', 'abc');
tasksNow = { ...tasksNow, daily: [task('D-EXP-aaaaaaaa', 2), task('D-EXP-bbbbbbbb', 0), task('D-EXP-cccccccc', 0)] };
await tasks.loadTasks();
check('when a task becomes ready the player is told, once, with its Gold', toasts.some((t) => /Task ready: Task D-EXP-aaaaaaaa.*\+5 Gold/.test(t)) && toasts.filter((t) => /Task ready/.test(t)).length === 1);
await tasks.loadTasks();
check('and not again on the next look', toasts.filter((t) => /Task ready/.test(t)).length === 1);
useCityStore.setState({ gold: 0 });
tasksNow = { ...tasksNow, daily: [task('D-EXP-aaaaaaaa', 2, { at: 1, gold: 5 }), task('D-EXP-bbbbbbbb', 0), task('D-EXP-cccccccc', 0)] };
const got = await tasks.collectTask('D-EXP-aaaaaaaa');
const claim = sent.filter((r) => /\/claim$/.test(r.url)).pop();
check('collecting sends the task in the address and nothing else: no progress, no "done", no amount', claim.method === 'POST' && claim.url.endsWith('/tasks/D-EXP-aaaaaaaa/claim') && (claim.body === '{}' || claim.body === undefined));
check('the balance is the server\'s answer (47), not the page\'s sum', got.paid === 5 && useCityStore.getState().gold === 47);
check('the player is told what was collected', toasts.some((t) => /Task collected: Task D-EXP-aaaaaaaa\. \+5 Gold/.test(t)));
check('the task list is read again, and shows it collected', useTasks.getState().data.daily[0].collected?.gold === 5);

// ---- refused: the server's words are shown, the balance does not move
claimAnswer = { status: 409, body: { error: 'It is not done yet.', code: 'not_done', progress: { have: 0, need: 2, done: false } } };
useCityStore.setState({ gold: 47 });
const refused = await tasks.collectTask('D-EXP-bbbbbbbb');
check('a task that is not done is refused, the player is told so, and the Gold does not move', refused === null && useCityStore.getState().gold === 47 && toasts.some((t) => /not done yet/.test(t)));
check('the button is free again after a refusal', useTasks.getState().busy === null);

delete process.env.NEXT_PUBLIC_LIVE_API_URL;
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
