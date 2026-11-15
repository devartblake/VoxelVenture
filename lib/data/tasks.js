// Player tasks, seen from the page (services/api/tasks.mjs; docs/product/daily_weekly_tasks.md). The page only SHOWS what the server says: which tasks are on offer, the progress
// the server worked out from its own records, and what has been collected. Collecting asks the server, which re-checks the task itself and pays the Gold; the page never says
// a task is done and never says how much it pays.
import { useCityStore } from '../state/store';
import { useTasks } from '../state/taskStore';
import { apiOn, getToken, request } from './api';

export const tasksRemote = () => request('GET', '/tasks');
export const myTasksRemote = ({ limit = 20, before = null } = {}) => request('GET', `/me/tasks?limit=${limit}${before ? `&before=${before}` : ''}`);

let timer = null;

/** Reads the tasks from the server and tells the player (a toast) about any that have just become ready to collect. */
export async function loadTasks() {
  try {
    const next = await tasksRemote();
    const before = useTasks.getState().data;
    useTasks.setState({ data: next, error: null, loaded: true });
    if (before && next.signedIn) {
      const was = new Map([...before.daily, ...before.weekly].map((t) => [`${t.id}@${t.period}`, t]));
      for (const t of [...next.daily, ...next.weekly]) {
        const old = was.get(`${t.id}@${t.period}`);
        if (old && !old.progress.done && t.progress.done && !t.collected) useCityStore.getState().notify(`Task ready: ${t.title}. Collect +${t.gold} Gold in Tasks.`);
      }
    }
    return next;
  } catch (e) {
    useTasks.setState({ error: e?.message || 'Could not load the tasks.', loaded: true });
    return null;
  }
}

/** Asks the server to collect a task. It checks the goal itself and pays the tier's Gold through the wallet; a refusal is shown in the server's words. */
export async function collectTask(id) {
  if (!getToken()) return null;
  useTasks.setState({ busy: id });
  try {
    const r = await request('POST', `/tasks/${id}/claim`, {});
    useCityStore.setState({ gold: r.gold });
    useCityStore.getState().notify(`Task collected: ${r.task.title}. +${r.paid} Gold`);
    await loadTasks();
    useTasks.setState({ history: null }); // the Collected list is read again when it is opened
    return r;
  } catch (e) {
    useCityStore.getState().notify(e?.code === 'not_done' ? 'That task is not done yet.' : e?.message || 'That did not work.');
    await loadTasks();
    return null;
  } finally {
    useTasks.setState({ busy: null });
  }
}

export async function loadHistory(before = null) {
  if (!getToken()) return null;
  try {
    const h = await myTasksRemote({ before });
    useTasks.setState((s) => ({ history: before && s.history ? { ...h, claims: [...s.history.claims, ...h.claims] } : h }));
    return h;
  } catch {
    return null;
  }
}

/** Starts reading the tasks now and every 30 seconds (only with a game server). */
export function startTasks() {
  if (!apiOn() || timer) return;
  loadTasks();
  timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) loadTasks(); }, 30000);
}
