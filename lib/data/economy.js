import { apiOn, request } from './api';
import { visitorId } from './visitor';

// The game's side of the plot economy's data (services/api/economy.mjs, docs/monetization/plot_economy_data.md): the server's claim hold, the steps
// towards a plot that only the game sees (a card opened, a take-over form opened, a setup by a player not signed in), and watching a plot. Only with
// a game server; every call is best effort except the hold and the watch, whose answers the card shows.

// A step the game saw: { step: 'card_open' | 'open' | 'hold' | 'quote', ...setup }. Never fails loudly: the data must not get in a player's way.
export function sendIntent(plotId, step, setup = {}) {
  if (!apiOn() || typeof plotId !== 'number') return Promise.resolve(null);
  return request('POST', `/plots/${plotId}/intent`, { step, visitor: visitorId(), ...setup }).catch(() => null);
}

// Hold an empty plot (or refresh the hold) while the signed-in player sets it up: { until, secondsLeft, quote }. Rejects with the server's
// ApiFailure: code 'held' with `secondsLeft` when another player holds it.
export const holdRemote = (plotId, setup = {}) => request('POST', `/plots/${plotId}/hold`, setup);
export const releaseRemote = (plotId) => request('DELETE', `/plots/${plotId}/hold`).catch(() => null);

// "Watch this plot": { watching }.
export const watchingRemote = (plotId) => request('GET', `/plots/${plotId}/watch`);
export const watchRemote = (plotId, on) => request(on ? 'POST' : 'DELETE', `/plots/${plotId}/watch`);
