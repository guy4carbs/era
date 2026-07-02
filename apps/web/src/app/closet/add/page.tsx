'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AddItemFlow } from '../../../components/items';
import { useSession } from '../../../lib/auth-client';

/**
 * The add-item screen: full-screen, on its own chrome (no tab bar), mirroring
 * the quiz. It is a signed-in surface — the flow writes items against the
 * session — so signed-out visitors are bounced to sign-in. A `?item=<id>` query
 * resumes an existing, unconfirmed item straight into the confirm step. The
 * search-param read lives behind Suspense per Next's app-router requirement.
 */
function AddItemScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, isPending } = useSession();
  const resumeItemId = params.get('item');

  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace('/sign-in');
  }, [isPending, session, router]);

  if (isPending || !session) return null;

  return <AddItemFlow resumeItemId={resumeItemId} />;
}

export default function AddItemPage() {
  return (
    <Suspense fallback={null}>
      <AddItemScreen />
    </Suspense>
  );
}
