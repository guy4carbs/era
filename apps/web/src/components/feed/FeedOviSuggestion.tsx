'use client';

import { useEffect, useMemo, useState } from 'react';
import { suggestForCloset } from '@era/core/ovi';
import { OviSuggestionHost } from '../ovi';
import { toOviItems, type OviItemSource } from '../ovi/to-ovi-items';
import { useSession } from '../../lib/auth-client';

/**
 * The morning page's quiet Ovi presence. It composes the SAME suggestion the
 * Closet shows — {@link suggestForCloset} over the owned pieces — so the two
 * surfaces share a dismissal key: wave a look off here and it stays gone on the
 * Closet too, and vice versa. That shared honesty is the point (a dismissed look
 * doesn't reappear on another screen).
 *
 * Items are fetched the way the Design tab fetches them — the same `/api/items`
 * every closet surface hits, non-blocking. No profile or wear logs on this
 * surface, so we pass `null`/`[]` honestly; the composer degrades to a less
 * style-specific pick, never a fabricated one. Silent until a look composes.
 */
export function FeedOviSuggestion() {
  const { data: session, isPending } = useSession();
  const [items, setItems] = useState<OviItemSource[] | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/items');
        if (!res.ok) throw new Error('items fetch failed');
        const body = (await res.json()) as { items: OviItemSource[] };
        if (active) setItems(body.items);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  const suggestion = useMemo(
    () => (items && items.length > 0 ? suggestForCloset(toOviItems(items), null, []) : null),
    [items],
  );

  return <OviSuggestionHost suggestion={suggestion} />;
}
