"use client";

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAccount } from '@/lib/state/accountStore';

const INPUT = 'w-full rounded-lg border border-sx-stroke bg-sx-alt px-3 py-2 text-sm text-white focus:border-sx-cyan focus:outline-none';

// The sign-in form. It opens only when something needs an account (claiming a plot, taking over a business, buying an ad space):
// browsing the city never asks. After signing in, whatever the player was trying to do carries on.
export default function AuthDialog() {
  const open = useAccount((s) => s.askOpen);
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await (mode === 'signup' ? useAccount.getState().signup(name, password, email.trim() || undefined) : useAccount.getState().login(name, password));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sign in">
      <form onSubmit={submit} className="relative w-full max-w-sm space-y-3 rounded-2xl border border-sx-stroke bg-gradient-to-b from-[#15104a] to-sx-page p-5 text-slate-100 shadow-2xl">
        <button type="button" onClick={() => useAccount.getState().cancelAsk()} className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-sx-alt hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-white">Sign in to continue</h2>
          <p className="text-xs text-slate-400">You need an account to own a plot or an ad space. Looking around never needs one.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-sx-alt p-0.5" role="tablist">
          {[['signup', 'Create an account'], ['login', 'I have one']].map(([id, label]) => (
            <button type="button" key={id} role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setError(''); }} className={`flex-1 rounded-md py-1.5 text-xs font-medium ${mode === id ? 'bg-gradient-to-r from-sx-purple to-sx-blue text-white' : 'text-slate-300 hover:bg-sx-stroke'}`}>
              {label}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (3-20 letters or numbers)" autoComplete="username" required className={INPUT} aria-label="Name" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password (8 or more characters)" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} className={INPUT} aria-label="Password" />
        {mode === 'signup' && <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional): for notices about your plots" autoComplete="email" className={INPUT} aria-label="Email" />}
        {error && <p className="rounded-md border border-red-700/50 bg-red-950/40 px-2.5 py-1.5 text-xs text-red-200" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-gradient-to-r from-sx-purple to-sx-blue py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
          {busy ? 'One moment…' : mode === 'signup' ? 'Create the account and continue' : 'Sign in and continue'}
        </button>
      </form>
    </div>
  );
}
