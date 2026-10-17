"use client";

import { useEffect } from 'react';
import { apiOn, request } from '@/lib/data/api';
import { visitorId } from '@/lib/data/visitor';
import { captureRef } from '@/lib/business/referral';
import { sourceOf } from '@/lib/business/profile';
import { QUALIFIED_AFTER_MS } from '@/lib/business/conversions';

const SEEN_AFTER_MS = 2000;
// the campaign the link was tagged with (?utm_campaign=spring-sale); the server checks and cleans it
const campaignParam = () => new URLSearchParams(window.location.search).get('utm_campaign') || undefined;

// Counts a profile view once the page has been visible for two seconds (a bounce or a prerender is not a view), with where the visitor came
// from and the referral code they arrived with, and a qualified visit once it has been visible for 15 seconds in all. The server decides
// whether each is verified (server/api/business.mjs). Renders nothing.
export default function ProfileTracker({ slug }) {
  useEffect(() => {
    const ref = captureRef();
    if (!apiOn()) return undefined;
    let timer = null;
    let qualifiedTimer = null;
    let sent = false;
    let qualified = false;
    let visibleFor = 0; // ms the page has been visible, over every visible stretch
    let since = 0;
    const post = (body) => request('POST', `/businesses/${encodeURIComponent(slug)}/events`, { visitor: visitorId(), campaign: campaignParam(), ...body }).catch(() => {});
    const send = () => {
      if (sent || document.visibilityState !== 'visible') return;
      sent = true;
      post({ kind: 'view', ref, source: sourceOf(document.referrer, window.location.hostname, window.location.search) });
    };
    const qualify = () => {
      if (qualified || !sent) return;
      qualified = true;
      post({ kind: 'engaged', ref });
    };
    const arm = () => {
      clearTimeout(timer);
      clearTimeout(qualifiedTimer);
      if (document.visibilityState === 'visible') {
        since = Date.now();
        timer = setTimeout(send, SEEN_AFTER_MS);
        if (!qualified) qualifiedTimer = setTimeout(() => (send(), qualify()), Math.max(0, QUALIFIED_AFTER_MS - visibleFor));
      } else if (since) {
        visibleFor += Date.now() - since;
        since = 0;
      }
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      clearTimeout(timer);
      clearTimeout(qualifiedTimer);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [slug]);
  return null;
}

// A press of the call to action (the server only counts it after a view by the same visitor), with the click id added to its link.
export function trackCta(slug, clickId) {
  if (!apiOn()) return;
  request('POST', `/businesses/${encodeURIComponent(slug)}/events`, { kind: 'cta', visitor: visitorId(), ref: captureRef(), campaign: campaignParam(), ...(clickId ? { clickId } : {}) }).catch(() => {});
}
