import { create } from 'zustand';

// What the page knows about the player's tasks: always a copy of what the server last said (lib/data/tasks.js), never its own count.
//   data     the answer to GET /tasks: { signedIn, day, week, daily, weekly, summary } or null before the first answer
//   history  the answer to GET /me/tasks: what the account collected, with totals, or null until it is asked for
//   busy     the id of the task being collected, so its button waits
export const useTasks = create(() => ({ data: null, history: null, loaded: false, error: null, busy: null }));
