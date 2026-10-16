"use client";

import { useEffect } from 'react';
import { apiOn } from '@/lib/data/api';
import { captureRef } from '@/lib/business/referral';
import { useAccount } from '@/lib/state/accountStore';

// The signed-in owner on the business pages: restores the sign-in once, and keeps a referral code the visitor arrived with (so signing up
// here credits whoever shared the link). `signIn()` opens the sign-in form when needed.
export function useOwner() {
  const account = useAccount((s) => s.account);
  const ready = useAccount((s) => s.ready);
  useEffect(() => {
    captureRef();
    if (!useAccount.getState().ready) useAccount.getState().hydrate();
  }, []);
  return { live: apiOn(), ready, account, signIn, logout: () => useAccount.getState().logout() };
}

// Resolves once signed in (opening the sign-in form if needed); rejects if the form is closed without signing in.
export function signIn() {
  return new Promise((resolve, reject) => {
    if (useAccount.getState().ask(resolve)) return resolve();
    const stop = useAccount.subscribe((s) => {
      if (s.askOpen) return;
      stop();
      if (s.account) resolve();
      else reject(new Error('Sign in to save your profile.'));
    });
  });
}
