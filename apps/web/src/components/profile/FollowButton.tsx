'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';
import { Button } from '../Button';

export interface FollowButtonProps {
  /** The profile being followed — sent as `{ username }` to `/api/follows`. */
  username: string;
  /** The profile's display name (or username) — names the sign-in prompt. */
  name: string;
  /** Whether a session is present. Signed-out viewers see a sign-in prompt, no button. */
  signedIn: boolean;
  /** The viewer's current follow edge, server-resolved (always false when signed out). */
  initialFollowing: boolean;
  /** Server-counted follower total; this island owns it live from here. */
  initialFollowerCount: number;
  /**
   * The owner's following total. Static (a viewer can't change who the owner
   * follows) — passed so the counts row renders as one unit. Omit on the private
   * card, which shows followers only.
   */
  followingCount?: number;
}

/**
 * The one social control on a profile — plus the live follower count it drives.
 *
 * The count lives here (not server-rendered) so an optimistic follow updates it
 * without a reload: a click flips the edge and adjusts the count by ±1 at once,
 * then reconciles to the server's freshly-counted `followerCount`; a failed write
 * reverts both and surfaces a quiet, polite error. Follow state is the three-label
 * pattern from `strings.profile`: `Follow` when not following, a resting
 * `Following` once you do, revealing `Unfollow` on hover/focus (mobile taps
 * straight through). The button's `aria-label` always names the ACTION a click
 * performs, so assistive tech is never misled by the resting label.
 *
 * Signed-out: no button — just the count and a `signInToFollow` prompt into
 * `/sign-in`, so the page stays fully shareable to anonymous viewers.
 *
 * Rendered only for a NON-owner viewer; the owner sees their own share affordance.
 */
export function FollowButton({
  username,
  name,
  signedIn,
  initialFollowing,
  initialFollowerCount,
  followingCount,
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revealUnfollow, setRevealUnfollow] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !following;
    // Optimistic: flip the edge and nudge the count, clamped at zero.
    setFollowing(next);
    setFollowerCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/follows', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error(`follows ${res.status}`);
      const body = (await res.json()) as { following: boolean; followerCount: number };
      setFollowing(body.following);
      if (typeof body.followerCount === 'number' && Number.isFinite(body.followerCount)) {
        setFollowerCount(Math.max(0, body.followerCount));
      }
    } catch {
      // Revert the optimistic change and toast a quiet, non-blaming line.
      setFollowing(!next);
      setFollowerCount((c) => Math.max(0, c + (next ? -1 : 1)));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const counts = (
    <p style={countsStyle}>
      <span>{strings.profile.followerCount(followerCount)}</span>
      {typeof followingCount === 'number' ? (
        <>
          <span aria-hidden="true" style={dotStyle}>
            ·
          </span>
          <span>{strings.profile.followingCount(followingCount)}</span>
        </>
      ) : null}
    </p>
  );

  if (!signedIn) {
    return (
      <div style={wrapStyle}>
        {counts}
        <p style={signInStyle}>
          <Link href="/sign-in" style={signInLinkStyle}>
            {strings.profile.signInToFollow(name)}
          </Link>
        </p>
      </div>
    );
  }

  // The action a click performs — names the aria-label regardless of resting text.
  const actionLabel = following ? strings.profile.unfollowCta : strings.profile.followCta;
  // The visible label: reveal "Unfollow" on hover/focus once following.
  const visibleLabel = following
    ? revealUnfollow
      ? strings.profile.unfollowCta
      : strings.profile.followingState
    : strings.profile.followCta;

  return (
    <div style={wrapStyle}>
      {counts}
      <Button
        variant={following ? 'secondary' : 'primary'}
        disabled={busy}
        aria-label={actionLabel}
        aria-pressed={following}
        onClick={() => void toggle()}
        onPointerEnter={() => setRevealUnfollow(true)}
        onPointerLeave={() => setRevealUnfollow(false)}
        onFocus={() => setRevealUnfollow(true)}
        onBlur={() => setRevealUnfollow(false)}
        style={followButtonStyle}
      >
        {visibleLabel}
      </Button>
      <p role="status" aria-live="polite" style={errorStyle}>
        {failed ? strings.errors.generic : ''}
      </p>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  alignItems: 'flex-start',
};

const countsStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-text)',
  fontWeight: 600,
};

const dotStyle: CSSProperties = {
  color: 'var(--color-secondary-strong)',
};

const followButtonStyle: CSSProperties = {
  minWidth: 'var(--space-16)',
};

const signInStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const signInLinkStyle: CSSProperties = {
  color: 'var(--color-accent)',
  textDecoration: 'none',
  fontWeight: 600,
};

// Always-present live region so a failed toggle is announced; empty until it fails.
const errorStyle: CSSProperties = {
  margin: 0,
  minHeight: `${typeRamp.footnote.lineHeight}px`,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-rust)',
};
