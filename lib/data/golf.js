// The mini-golf course's saved leaderboard, held by the server (services/api/golf.mjs; docs/world/minigolf.md, "The saved leaderboard"). The page sends the putts of a finished one-player round (for each hole,
// [angle, power] in thousandths) and never a score: the server plays them again and keeps what comes out. Without a game server or an account nothing is saved (the device's own best still is).
import { apiOn, getToken, request } from './api';

export const golfLive = () => apiOn() && Boolean(getToken());
export const golfSubmit = (course, putts) => request('POST', '/golf/round', { course, putts });
export const golfLeaderboard = (course, limit = 8) => request('GET', `/golf/leaderboard?course=${encodeURIComponent(course)}&limit=${limit}`);
export const golfMine = (course) => request('GET', `/golf/me?course=${encodeURIComponent(course)}`);
