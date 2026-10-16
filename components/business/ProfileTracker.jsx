"use client";

import { useEffect } from 'react';
import { apiOn, request } from '@/lib/data/api';
import { visitorId } from '@/lib/data/sync';
import { captureRef } from '@/lib/business/referral';
import { sourceOf } from '@/lib/business/profile';

const SEEN_AFTER_MS = 2000;
// the campaign the link was tagged with (?utm_campaign=spring-sale); the server checks and cleans it
const campaignParam = () => new URLSearchParams(window.location.search).get('utm_campaign') || undefined;

// Counts a profile view once the page has been visible for two seconds (a bounce or a prerender is not a view), with where the visitor came
// from and the referral code they arrived with. The server decides whether it is verified (server/api/business.mjs). Renders nothing.
export default function ProfileTracker({ slug }) {
  useEffect(() => {
    const ref = captureRef();
    if (!apiOn()) return undefined;
    let timer = null;
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== 'visible') return;
      sent = true;
      request('POST', `/businesses/${encodeURIComponent(slug)}/events`, { kind: 'view', visitor: visitorId(), ref, source: sourceOf(document.referrer, window.location.hostname, window.location.search), campaign: campaignParam() }).catch(() => {});
    };
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = setTimeout(send, SEEN_AFTER_MS);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [slug]);
  return null;
}

// A press of the call to action (the server only counts it after a view by the same visitor).
export function trackCta(slug) {
  if (!apiOn()) return;
  request('POST', `/businesses/${encodeURIComponent(slug)}/events`, { kind: 'cta', visitor: visitorId(), ref: captureRef(), campaign: campaignParam() }).catch(() => {});
}
