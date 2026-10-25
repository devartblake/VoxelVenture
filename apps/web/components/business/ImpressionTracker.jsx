"use client";

import { useEffect, useRef } from 'react';
import { apiOn, request } from '@/lib/data/api';
import { visitorId } from '@/lib/data/visitor';

const SEEN_MS = 1000; // a card counts as seen once at least half of it has been on screen for a second
const SEND_EVERY_MS = 4000;

// Counts the impressions of the business cards in the list it sits in: a card (li[data-slug]) at least half on screen for a second.
// Sent in small batches; the server keeps one per visitor and profile an hour (services/api/conversions.mjs). Renders an empty marker.
// `surface` is the screen the list is on (services/api/business.mjs SURFACES); `watch` changes when the list's cards do (a new search).
export default function ImpressionTracker({ surface = null, watch = null }) {
  const marker = useRef(null);
  useEffect(() => {
    const list = marker.current?.parentElement;
    if (!apiOn() || !list || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Set();
    const pending = new Set();
    const timers = new Map();
    const flush = () => {
      if (!pending.size) return;
      const slugs = [...pending];
      pending.clear();
      request('POST', '/businesses/impressions', { slugs, visitor: visitorId(), ...(surface ? { surface } : {}) }).catch(() => {});
    };
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const slug = e.target.getAttribute('data-slug');
        if (!slug || seen.has(slug)) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (!timers.has(slug)) timers.set(slug, setTimeout(() => (seen.add(slug), pending.add(slug), timers.delete(slug)), SEEN_MS));
        } else {
          clearTimeout(timers.get(slug));
          timers.delete(slug);
        }
      }
    }, { threshold: [0, 0.5] });
    list.querySelectorAll('li[data-slug]').forEach((li) => observer.observe(li));
    const every = setInterval(flush, SEND_EVERY_MS);
    const away = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', away);
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
      clearInterval(every);
      document.removeEventListener('visibilitychange', away);
      flush();
    };
  }, [surface, watch]);
  return <span ref={marker} hidden />;
}
