"use client";

import { useRouter } from 'next/navigation';
import { request } from '@/lib/data/api';
import AuthDialog from '@/components/ui/AuthDialog';
import ProfileForm from './ProfileForm';
import NotLive from './NotLive';
import { signIn, useOwner } from './useOwner';

// Listing a business: free, no plot needed. Sign-in is asked for only when saving.
export default function NewProfile() {
  const router = useRouter();
  const { live, account } = useOwner();
  if (!live) return <NotLive />;
  const save = async (input) => {
    await signIn(); // the form opens only if needed; saving carries on once they are in
    await request('POST', '/businesses', input);
    router.push('/business/manage?created=1');
  };
  return (
    <>
      <ProfileForm submitLabel={account ? 'Publish my free profile' : 'Sign in and publish'} onSubmit={save} />
      <AuthDialog />
    </>
  );
}
