import fs from 'node:fs';

// The first filter on everything players write (blocked words, link floods, shouting, repeated characters). On its own, with no
// database or game code, so the presence server can use it as well as the API (moderation.mjs re-exports it).

// A small starter list of spam and abuse terms. Put more (one per line) in a file and point MODERATION_WORDS_FILE at it.
const STARTER = ['viagra', 'casino bonus', 'free crypto', 'crypto giveaway', 'click here to win', 'porn', 'xxx', 'nude', 'kill yourself', 'send nudes', 'whatsapp me', 'telegram me'];
export const wordList = (env = process.env) => {
  const extra = env.MODERATION_WORDS_FILE && fs.existsSync(env.MODERATION_WORDS_FILE) ? fs.readFileSync(env.MODERATION_WORDS_FILE, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean) : [];
  return [...STARTER, ...extra];
};
// "v1agra", "v.i.a.g.r.a" and "VIAGRA" all read as "viagra"
const normalise = (t) => String(t).toLowerCase().replace(/[01345$@!|]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', $: 's', '@': 'a', '!': 'i', '|': 'l' })[c]).replace(/[^a-z0-9 ]/g, '');
const squash = (t) => normalise(t).replace(/\s+/g, '');

// Returns { ok: true } or { ok: false, reason }. `links` is how many web links the text may contain.
export function checkText(value, { links = 1, words = wordList() } = {}) {
  const t = String(value ?? '');
  if (!t.trim()) return { ok: true };
  const flat = squash(t);
  const hit = words.find((w) => flat.includes(w.replace(/\s+/g, '')));
  if (hit) return { ok: false, reason: 'That text is not allowed here.' };
  if ((t.match(/https?:\/\/|www\./gi) ?? []).length > links) return { ok: false, reason: `Please keep it to ${links === 0 ? 'no links' : links === 1 ? 'one link' : `${links} links`}.` };
  if (/(.)\1{9,}/.test(t)) return { ok: false, reason: 'Please do not repeat one character like that.' };
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8) return { ok: false, reason: 'Please do not write everything in capitals.' };
  return { ok: true };
}

// A chat line or private message as plain text: valid Unicode only (lone surrogates dropped), no control characters except line breaks
// when `lines` is set (\r\n becomes \n, at most two blank lines in a row), trimmed, and at most `max` characters (code points, so an
// emoji counts once). Returns '' for nothing left.
export function cleanMessage(value, max, { lines = false } = {}) {
  if (typeof value !== 'string') return '';
  let t = value.toWellFormed ? value.toWellFormed().replace(/�/g, '') : value;
  t = t.replace(/\r\n?/g, '\n');
  t = [...t].filter((c) => { const n = c.codePointAt(0); return (lines && n === 10) || (n >= 32 && n !== 127 && !(n >= 0x80 && n < 0xa0) && n !== 0x2028 && n !== 0x2029); }).join('');
  if (!lines) t = t.replace(/\s+/g, ' ');
  else t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  return [...t.trim()].slice(0, max).join('').trim();
}
