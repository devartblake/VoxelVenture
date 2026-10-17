import { create } from 'zustand';
import { apiOn, request } from '../data/api';
import { useCityStore } from './store';
import { LEADERS_SHOWN, addWeeks, simulatedTally, voteProblem, votesAllowed, votingClosesAt, weekStartOf, withLocalVotes } from '../game/buildingOfWeek';

// Building of the Week (rules: lib/game/buildingOfWeek.js). With a game server the votes are the server's (server/api/community.mjs). Without
// one it still works as a demo: your votes are kept in this browser and the rest of the city's are simulated, so it can be seen and tried.
//
// `votes` has one shape either way: { week, signedIn, huntWon, allowed, votedFor, votesLeft, canVote, leaders, winner, endsAt, demo }.
const KEY = 'voxelventure-votes'; // the demo's own votes: { week, votedFor, huntWon }

function readLocal() {
  const week = weekStartOf();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.week === week) return { week, votedFor: Array.isArray(saved.votedFor) ? saved.votedFor.map(Number) : [], huntWon: Boolean(saved.huntWon) };
  } catch {
    /* storage unavailable: a fresh week */
  }
  return { week, votedFor: [], huntWon: false };
}
function writeLocal(local) {
  try {
    localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    /* the votes last this visit only */
  }
}

// The demo's view: the simulated city plus your own votes.
function demoVotes() {
  const plots = useCityStore.getState().plots;
  const local = readLocal();
  const allowed = votesAllowed(local.huntWon);
  const lastWeek = simulatedTally(plots, addWeeks(local.week, -1))[0] ?? null;
  return {
    week: local.week,
    signedIn: true,
    huntWon: local.huntWon,
    allowed,
    votedFor: local.votedFor,
    votesLeft: Math.max(0, allowed - local.votedFor.length),
    canVote: local.votedFor.length < allowed,
    leaders: withLocalVotes(simulatedTally(plots, local.week), plots, local.votedFor).slice(0, LEADERS_SHOWN),
    winner: lastWeek ? { ...lastWeek, week: addWeeks(local.week, -1) } : null,
    endsAt: votingClosesAt(local.week),
    demo: true,
  };
}

export const useCommunity = create((set, get) => ({
  votes: null,
  botw: null, // this week's Building of the Week (last week's winner): { plotId, title, votes, week } (from the state sync, or the demo)
  notice: null,
  async loadVotes() {
    if (!apiOn()) {
      const votes = demoVotes();
      set({ votes });
      get().setBotw(votes.winner);
      return;
    }
    try {
      set({ votes: await request('GET', '/votes') });
    } catch {
      /* the card just shows no voting */
    }
  },
  async vote(plotId) {
    if (!apiOn()) {
      const plot = useCityStore.getState().plots.find((p) => p.id === plotId);
      const local = readLocal();
      const problem = voteProblem(plot, { votedFor: local.votedFor, left: votesAllowed(local.huntWon) - local.votedFor.length, ownPlot: Boolean(plot?.userClaimed) });
      if (problem) {
        set({ notice: { ok: false, text: problem } });
        return false;
      }
      writeLocal({ ...local, votedFor: [...local.votedFor, plotId] });
      set({ votes: demoVotes(), notice: { ok: true, text: `Thanks: your vote for ${plot.title} is in.` } });
      return true;
    }
    try {
      const votes = await request('POST', '/vote', { plotId });
      const title = votes.leaders?.find((l) => l.plotId === plotId)?.title;
      set({ votes, notice: { ok: true, text: `Thanks: your vote${title ? ` for ${title}` : ''} is in.` } });
      return true;
    } catch (e) {
      set({ notice: { ok: false, text: e?.message ?? 'The vote did not go through.' } });
      return false;
    }
  },
  // All three gold stars found today: with a server lib/data/sync.js tells it; the demo remembers it for this week.
  huntWon() {
    if (apiOn()) return;
    writeLocal({ ...readLocal(), huntWon: true });
    set({ votes: demoVotes() });
  },
  clearNotice: () => set({ notice: null }),
  setBotw: (botw) => {
    const was = get().botw;
    if ((was?.plotId ?? null) !== (botw?.plotId ?? null)) set({ botw });
  },
}));
