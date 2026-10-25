import { isRefCode } from '@voxelventure/business-core';
import { apiOn, getToken, request } from '../data/api';

// The referral code a visitor arrived with (?ref= on any page), kept in this browser for 30 days so a sign-up or a profile view later on is
// still credited to the person who shared the link. The most recent link wins. First-party only: nothing leaves the site but the code itself.
const KEY = 'voxelventure-ref';
const KEEP_MS = 30 * 86400000;

export function captureRef(search = typeof window !== 'undefined' ? window.location.search : '') {
  const code = new URLSearchParams(search ?? '').get('ref');
  if (isRefCode(code)) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    } catch {
      /* storage blocked: the code still counts for this page */
    }
    return code;
  }
  return currentRef();
}

export function currentRef() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved && isRefCode(saved.code) && Date.now() - saved.at < KEEP_MS ? saved.code : null;
  } catch {
    return null;
  }
}

// The signed-in player's own referral code (GET /me/referrals), asked for once per page and remembered; null without a server or when
// signed out. Share buttons add it to the links they make (withRef), so the player who shared a business is credited.
let mine = null;
export function myRefCode() {
  if (!apiOn() || !getToken()) return Promise.resolve(null);
  mine ??= request('GET', '/me/referrals').then((r) => (isRefCode(r?.code) ? r.code : null), () => ((mine = null), null));
  return mine;
}
export function withRef(url, code) {
  if (!isRefCode(code)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('ref', code);
    return u.toString();
  } catch {
    return url;
  }
}
