"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiOn, request } from '@/lib/data/api';
import { useAccount } from '@/lib/state/accountStore';
import AuthDialog from '@/components/ui/AuthDialog';

// Vote for a business's building as Building of the Week, from its page (lib/game/buildingOfWeek.js). With the game server it votes here,
// asking for a sign-in first if needed; the demo (no server) keeps votes in the game, so it opens the building in the 3D city instead.
const BUTTON = 'inline-flex min-h-11 items-center rounded-xl bg-yellow-400 px-5 font-semibold text-yellow-950 hover:brightness-110 disabled:opacity-50';

export default function VoteButton({ plotId, name }) {
  const account = useAccount((s) => s.account);
  const [status, setStatus] = useState(null); // the API's GET /votes for this player
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const live = apiOn();
  useEffect(() => {
    if (!live) return;
    let alive = true;
    (async () => {
      if (!useAccount.getState().ready) await useAccount.getState().hydrate();
      const v = await request('GET', '/votes').catch(() => null);
      if (alive) setStatus(v);
    })();
    return () => {
      alive = false;
    };
  }, [live, account?.id]);

  if (!live) return <Link href={`/b/${plotId}`} className={BUTTON}>Vote in the 3D city</Link>;
  if (!status) return null;
  const go = async () => {
    setBusy(true);
    try {
      setStatus(await request('POST', '/vote', { plotId }));
      setNote({ ok: true, text: `Thanks: your vote for ${name} is in.` });
    } catch (e) {
      setNote({ ok: false, text: e?.message ?? 'The vote did not go through.' });
    } finally {
      setBusy(false);
    }
  };
  const mine = status.votedFor?.includes(plotId);
  return (
    <div className="flex flex-col gap-1" data-testid="profile-vote">
      {mine ? (
        <span className="inline-flex min-h-11 items-center rounded-xl border border-yellow-400/50 px-5 font-semibold text-yellow-200">You voted for it this week</span>
      ) : !account ? (
        <button type="button" onClick={() => useAccount.getState().ask(go)} className={BUTTON}>Sign in to vote for it</button>
      ) : status.votesLeft > 0 ? (
        <button type="button" onClick={go} disabled={busy} className={BUTTON}>Vote: Building of the Week</button>
      ) : (
        <span className="text-sm text-slate-400">You have used your votes this week. {!status.huntWon && <Link href="/?panel=week" className="underline hover:text-white">Find the three gold stars in the city for one more.</Link>}</span>
      )}
      {note && <span className={`text-sm ${note.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{note.text}</span>}
      <AuthDialog />
    </div>
  );
}
