// The racing track's lap times and leaderboard, held by the server (services/api/race.mjs; docs/world/racing_track.md, "Lap timing"). The page says where the avatar is at a point of the circuit and shows
// whatever the server answers: it never sends a time and never adds to one. Without a game server (no NEXT_PUBLIC_LIVE_API_URL) or without an account the lap clock still runs on the page, but
// nothing is recorded: guests are not on the board.
import { apiOn, getToken, request } from './api';

export const raceLive = () => apiOn() && Boolean(getToken());
export const racePass = (track, index, x, z) => request('POST', '/race/pass', { track, index, x, z });
export const raceLeaderboard = (track, limit = 8) => request('GET', `/race/leaderboard?track=${encodeURIComponent(track)}&limit=${limit}`);
export const raceMine = (track) => request('GET', `/race/me?track=${encodeURIComponent(track)}`);
