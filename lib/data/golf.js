// The mini-golf course's saved leaderboard, held by the server (services/api/golf.mjs; docs/world/minigolf.md, "The saved leaderboard"). The page sends the putts of a finished round (both players' on a two-player one) (for each hole,
// [angle, power] in thousandths) and never a score: the server plays them again and keeps what comes out. Without a game server or an account nothing is saved (the device's own best still is).
import { apiOn, getToken, request } from './api';

export const golfLive = () => apiOn() && Boolean(getToken());
export const golfSubmit = (course, putts, match) => request('POST', '/golf/round', { course, putts, ...(match ?? {}) }); // (a two-player round adds `putts2` and `names`)
export const golfLeaderboard = (course, limit = 8) => request('GET', `/golf/leaderboard?course=${encodeURIComponent(course)}&limit=${limit}`);
export const golfMatches = (course) => request('GET', `/golf/matches?course=${encodeURIComponent(course)}`);
export const golfMine = (course) => request('GET', `/golf/me?course=${encodeURIComponent(course)}`);
