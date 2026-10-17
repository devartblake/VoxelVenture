"use client";

import { useState } from 'react';
import { apiOn, request } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';

// Report a profile to the moderators (signed-in visitors; services/api/moderation.mjs).
export default function ReportProfile({ slug }) {
  const [state, setState] = useState('');
  if (!apiOn()) return null;
  const send = async () => {
    if (!useAccount.getState().ready) await useAccount.getState().hydrate();
    if (!useAccount.getState().account) {
      setState('Sign in from “My profiles” to report a business.');
      return;
    }
    if (!window.confirm('Report this business to the moderators as spam or misleading?')) return;
    try {
      await request('POST', '/reports', { kind: 'business', id: slug, reason: 'misleading' });
      setState('Reported. Thank you.');
    } catch (e) {
      setState(e.message);
    }
  };
  return state ? <span className="text-sm text-sx-muted" role="status">{state}</span> : <button type="button" onClick={send} className="text-sm text-sx-muted underline hover:text-white">Report</button>;
}
