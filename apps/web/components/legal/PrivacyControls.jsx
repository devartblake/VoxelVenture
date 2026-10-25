"use client";

import { useState } from 'react';
import { request, setToken } from '@/lib/data/api';
import { KEPT, MONEY_ON_DELETE, PRIVACY, REMOVED } from '@/lib/legal/privacy';
import { useAccount } from '@/lib/state/accountStore';

// "Your data": download everything the server holds about the account (GET /me/export: a .json file and a plain-language .txt), and delete the
// account (POST /me/delete) after a confirmation screen that says what goes, what stays and why, and what happens to money (with the estimated
// refund of unused time, GET /me/prorata, that the deletion makes first); the password and
// the account's name are asked again (services/api/privacy.mjs). In the game's Account panel (`compact`) and on /business/manage.
const usd = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const save = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function PrivacyControls({ account, compact = false }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [estimate, setEstimate] = useState(null);
  const t = compact ? { box: 'rounded-2xl border border-sx-stroke bg-sx-alt/40 p-3', h: 'mb-1 text-xs font-bold text-white', p: 'text-[11px] text-slate-400', li: 'text-[11px] text-slate-300', btn: 'rounded-full border border-sx-stroke px-3 py-1 text-[11px] text-slate-200 hover:border-sx-line', input: 'w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-1.5 text-xs text-white focus:border-sx-cyan focus:outline-none' } : { box: 'mt-8 rounded-2xl border border-sx-stroke bg-sx-panel p-5', h: 'text-lg font-semibold text-white', p: 'text-sm text-sx-muted', li: 'text-sm text-slate-300', btn: 'rounded-lg border border-sx-stroke px-3 py-2 text-sm text-slate-200 hover:bg-sx-alt', input: 'w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-sm text-white focus:border-sx-cyan focus:outline-none' };

  const download = async () => {
    setBusy('export');
    setError('');
    setNote('');
    try {
      const x = await request('GET', '/me/export');
      const stem = `voxelventure-${x.account.username}-${new Date(x.generatedAt).toISOString().slice(0, 10)}`;
      save(`${stem}.json`, JSON.stringify(x, null, 2), 'application/json');
      save(`${stem}-summary.txt`, x.summary.join('\n'), 'text/plain');
      setNote(`Downloaded: ${stem}.json and a summary you can read. You can do this ${PRIVACY.exportsPerDay} times a day.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };
  // the refund of unused time the deletion makes first (GET /me/prorata, services/api/prorata.mjs): shown before the person confirms
  const startDelete = async () => {
    setConfirming(true);
    setEstimate(null);
    try {
      setEstimate(await request('GET', '/me/prorata'));
    } catch {
      setEstimate({ error: true });
    }
  };
  const remove = async (e) => {
    e.preventDefault();
    setBusy('delete');
    setError('');
    try {
      const out = await request('POST', '/me/delete', { password, confirm: name });
      // signed out here too; the signed-out views say it is done (DeletedNotice)
      setToken('');
      useAccount.setState({ account: null, deletedAs: out.username });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className={t.box} data-testid="privacy-controls" aria-labelledby="privacy-h">
      <h3 id="privacy-h" className={t.h}>Your data</h3>
      <p className={t.p}>Download a copy of everything we hold about your account, or delete it. <a href="/legal/privacy#rights" className="underline hover:text-white">How this works</a></p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={download} disabled={busy === 'export'} className={t.btn} data-testid="download-my-data">{busy === 'export' ? 'Preparing…' : 'Download my data'}</button>
        {!confirming && <button type="button" onClick={startDelete} className={`${t.btn} border-rose-500/60 text-rose-200`} data-testid="delete-account">Delete my account…</button>}
      </div>
      {note && <p className={`mt-2 ${t.li}`} role="status">{note}</p>}
      {confirming && (
        <form onSubmit={remove} className="mt-3 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3" data-testid="delete-confirm">
          <p className={`font-semibold text-rose-100 ${compact ? 'text-xs' : 'text-sm'}`}>Delete the account {account.username}? This happens at once and cannot be undone. Download your data first if you want a copy.</p>
          <p className={`mt-2 font-semibold text-white ${compact ? 'text-[11px]' : 'text-sm'}`}>What is removed</p>
          <ul className="ml-4 list-disc">{REMOVED.map((r) => <li key={r} className={t.li}>{r}</li>)}</ul>
          <p className={`mt-2 font-semibold text-white ${compact ? 'text-[11px]' : 'text-sm'}`}>What is kept, and why</p>
          <ul className="ml-4 list-disc">{KEPT.map((k) => <li key={k.what} className={t.li}>{k.what}: {k.why}.</li>)}</ul>
          <p className={`mt-2 font-semibold text-white ${compact ? 'text-[11px]' : 'text-sm'}`}>Money</p>
          <div className={`mt-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 ${t.li}`} data-testid="delete-refund" role="status">
            {!estimate ? 'Working out your refund…' : estimate.error ? 'Your refund could not be worked out right now. What is due is still refunded when you delete.' : estimate.totalCents > 0 ? (
              <>
                <span className="font-semibold text-emerald-100">You&apos;ll get back about {usd(estimate.totalCents)} for unused time</span>, to the card you paid with:
                <ul className="ml-4 mt-1 list-disc">{estimate.lines.filter((l) => l.refund).map((l) => <li key={l.orderId}>{l.label}: {usd(l.cents)} ({l.unusedDays == null ? 'not opened yet' : l.notStarted ? 'not started yet' : `${l.unusedDays} of ${l.termDays} days unused`})</li>)}</ul>
              </>
            ) : 'Nothing you paid for has unused time to refund.'}
          </div>
          <ul className="ml-4 mt-1 list-disc">{MONEY_ON_DELETE.map((m) => <li key={m} className={t.li}>{m}</li>)}</ul>
          <p className={`mt-1 ${t.li}`}><a href="/legal/refunds" className="underline hover:text-white">The refund policy</a></p>
          <div className="mt-3 space-y-2">
            <label className={`block ${t.li}`}>Your password
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={t.input} aria-label="Your password" />
            </label>
            <label className={`block ${t.li}`}>Type your account name ({account.username}) to confirm
              <input autoComplete="off" required value={name} onChange={(e) => setName(e.target.value)} className={t.input} aria-label="Type your account name" />
            </label>
          </div>
          {error && <p className={`mt-2 text-rose-300 ${compact ? 'text-[11px]' : 'text-sm'}`} role="alert">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={busy === 'delete' || name.trim().toLowerCase() !== account.username.toLowerCase() || !password} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50" data-testid="delete-account-confirm">{busy === 'delete' ? 'Deleting…' : 'Delete my account for good'}</button>
            <button type="button" onClick={() => (setConfirming(false), setError(''))} className={t.btn}>Keep my account</button>
          </div>
        </form>
      )}
      {!confirming && error && <p className={`mt-2 text-rose-300 ${compact ? 'text-[11px]' : 'text-sm'}`} role="alert">{error}</p>}
    </section>
  );
}

// Shown where the signed-out view replaces the account after it was deleted in this tab.
export function DeletedNotice({ compact = false }) {
  const name = useAccount((s) => s.deletedAs);
  if (!name) return null;
  return (
    <p className={compact ? 'rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-100' : 'mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100'} data-testid="account-deleted" role="status">
      Your account is deleted. It is now called {name}, nothing personal is left in it, and you are signed out everywhere.
    </p>
  );
}
