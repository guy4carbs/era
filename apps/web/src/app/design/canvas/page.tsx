'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OutfitCanvas } from '../../../components/design';
import { useSession } from '../../../lib/auth-client';

/**
 * The outfit canvas screen: full-screen, on its own chrome (no tab bar), like
 * the add-item and quiz routes. It writes outfits against the session, so
 * signed-out visitors are bounced to sign-in. A `?outfit=<id>` query reopens a
 * saved outfit at its transforms. The search-param read sits behind Suspense per
 * Next's app-router requirement.
 */
function CanvasScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, isPending } = useSession();
  const outfitId = params.get('outfit');

  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace('/sign-in');
  }, [isPending, session, router]);

  if (isPending || !session) return null;

  return <OutfitCanvas outfitId={outfitId} />;
}

export default function CanvasPage() {
  return (
    <Suspense fallback={null}>
      <CanvasScreen />
    </Suspense>
  );
}
