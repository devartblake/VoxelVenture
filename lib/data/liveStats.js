import { create } from 'zustand';
import { request } from './api';
import { useAccount } from '../state/accountStore';

// The server's real figures for the buildings the player looks at (only with a game server): thirty days of verified visits
// (GET /plots/{id}/stats) and the ownership history from the ledger (GET /plots/{id}/history). Fetched when a card or the dashboard
// asks (`wantFigures`) and kept for 30 seconds. Until they arrive a figure is null, never a simulated stand-in (docs/architecture/authoritative_data.md).
export const FRESH_MS = 30000;
export const useLiveStats = create(() => ({ stats: {}, history: {} })); // { [plotId]: { at, data } | { at, error } }
const inflight = new Set();
// the owner gets a building's full figures and anyone else a summary, so what was fetched before signing in or out is dropped
useAccount.subscribe((s, prev) => {
  if (s.account?.id !== prev.account?.id) useLiveStats.setState({ stats: {} });
});

function load(kind, id, path) {
  const key = `${kind}:${id}`;
  const have = useLiveStats.getState()[kind][id];
  if (inflight.has(key) || (have && Date.now() - have.at < FRESH_MS)) return;
  inflight.add(key);
  request('GET', path)
    .then((data) => ({ at: Date.now(), data }), (e) => ({ at: Date.now(), error: e.message }))
    .then((entry) => useLiveStats.setState((s) => ({ [kind]: { ...s[kind], [id]: entry } })))
    .finally(() => inflight.delete(key));
}

// Ask for a building's figures (a plot on the server: numeric ids only; mall stores are not on the server).
export function wantFigures(id) {
  if (typeof id !== 'number') return;
  load('stats', id, `/plots/${id}/stats`);
  load('history', id, `/plots/${id}/history`);
}

// What has arrived: the statistics (null while loading, on an error, or for an empty lot) and the history ({ events, owners } or null).
export const liveStatsOf = (id, state = useLiveStats.getState()) => {
  const d = state.stats[id]?.data;
  return d && !d.empty ? d : null;
};
export const liveHistoryOf = (id, state = useLiveStats.getState()) => state.history[id]?.data ?? null;
// 'loading' | 'error' | 'ready' for a building's statistics
export const figuresState = (id, state = useLiveStats.getState()) => (state.stats[id]?.error ? 'error' : state.stats[id]?.data ? 'ready' : 'loading');
