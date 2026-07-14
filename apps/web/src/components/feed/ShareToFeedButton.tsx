'use client';

import { useState, type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { isEraFeedEnabled } from '@era/core/feed-flags';

export interface ShareToFeedButtonProps {
  /** Share this saved outfit. Provide exactly one of `outfitId` / `eraId`. */
  readonly outfitId?: string;
  /**
   * Share this era — the ONLY era-share surface on web this phase (mobile era
   * share lands with the future era-detail screen). Provide exactly one of
   * `outfitId` / `eraId`.
   */
  readonly eraId?: string;
  /**
   * The subject's already-live feed post id (from the outfit/era list payload),
   * or null when it isn't shared — seeds the toggle so a reload/remount shows the
   * true shared state instead of resetting to "Share".
   */
  readonly initialSharedPostId?: string | null;
}

const buttonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-accent)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
};

/**
 * Flag-gated "Share to feed" toggle for a saved outfit or era on the Design tab —
 * the web share-to-feed entry point. It mirrors the inline "add to an era" idiom
 * already on the outfit card: a quiet accent-text button, not a heavy control.
 *
 * COSMETIC GATE: renders nothing unless `NEXT_PUBLIC_ERA_FEED_ENABLED` is exactly
 * 'true'. The server 404s the `/api/posts` routes whenever the real
 * `ERA_FEED_ENABLED` flag is off, so this only decides whether the affordance
 * shows — it is never the security boundary.
 *
 * A first tap shares via `POST /api/posts` and holds the returned post id; a
 * second tap unshares that post via `DELETE /api/posts`.
 *
 * SHARED STATE hydrates from `initialSharedPostId` — the subject's live post id,
 * now carried on the outfit/era list payloads — so an already-shared subject
 * reads as shared after a reload or a remount (e.g. the Design grid re-fetches
 * after an era is created), not just for what this session shared.
 */
export function ShareToFeedButton({ outfitId, eraId, initialSharedPostId }: ShareToFeedButtonProps) {
  const [sharedPostId, setSharedPostId] = useState<string | null>(initialSharedPostId ?? null);
  const [busy, setBusy] = useState(false);

  // Cosmetic gate — the routes are the real gate. Hooks run first (above) so the
  // early return never trips the rules-of-hooks.
  if (!isEraFeedEnabled(process.env.NEXT_PUBLIC_ERA_FEED_ENABLED)) {
    return null;
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (sharedPostId) {
        const res = await fetch('/api/posts', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ postId: sharedPostId }),
        });
        if (!res.ok) throw new Error(`unshare ${res.status}`);
        setSharedPostId(null);
      } else {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(outfitId ? { outfitId } : { eraId }),
        });
        if (!res.ok) throw new Error(`share ${res.status}`);
        const data = (await res.json()) as { post: { id: string } };
        setSharedPostId(data.post.id);
      }
    } catch {
      // Quiet failure: leave the label in its last good state (no toast surface
      // is threaded this deep). The user can tap again.
    } finally {
      setBusy(false);
    }
  }

  const label = sharedPostId
    ? `${strings.feed.shared} · ${strings.feed.unshare}`
    : strings.feed.share;

  return (
    <button
      type="button"
      style={{ ...buttonStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
      disabled={busy}
      aria-pressed={sharedPostId !== null}
      onClick={() => void toggle()}
    >
      {label}
    </button>
  );
}
