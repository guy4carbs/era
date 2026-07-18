'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { layout, motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { REPORT_REASONS, type FeedPostPayload, type ReportReason } from '@era/core/feed';
import { Avatar } from '../profile/Avatar';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Text } from '../Text';
import { transitionFor } from '../../lib/motion';

/** ≤500 app cap on the free-text report detail (mirrors REPORT_DETAIL_MAX server-side). */
const REPORT_DETAIL_MAX = 500;

/** next/image width hint: the feed is one 480px-capped column, full-width below that. */
const COVER_SIZES = `(min-width:${layout.breakpoints.lg}px) ${layout.feedColumnWidth}px, 100vw`;

export interface FeedCardProps {
  readonly post: FeedPostPayload;
  /**
   * The viewer's own handle, when known. A viewer's own posts are filtered out
   * server-side (creator ≠ viewer), so this is a belt-and-braces guard that hides
   * the follow pill on a self-post; it no-ops when the handle isn't available.
   */
  readonly viewerUsername?: string;
  readonly onLike: (post: FeedPostPayload) => void;
  readonly onSave: (post: FeedPostPayload) => void;
  readonly onFollow: (post: FeedPostPayload) => void;
  /** A report succeeded (or a block) — the parent removes this post from the list. */
  readonly onReported: (postId: string) => void;
  /** A block succeeded — the parent removes every card by this creator. */
  readonly onBlocked: (username: string) => void;
}

/** Compact count: 999 → "999", 1_200 → "1.2k", 12_300 → "12k". */
function compact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  const k = n / 1000;
  return k < 10 ? `${k.toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(k)}k`;
}

/** A short, calm timestamp: "3m", "5h", "2d", else a "Mar 4"-style date. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(then);
}

/**
 * One post in the web feed: a quiet-luxury card, not the mobile full-screen pager.
 *
 * Top row credits the creator (avatar + @username → their profile, display name,
 * and when it was shared) with the follow pill and a more-menu on the right. The
 * cover sits in a 4:5 frame, `object-fit: contain` over the surface so a look is
 * never cropped (covers are 4:5 view-shots). The footer carries the title and the
 * like/save controls with their live counts. Like/save/follow are optimistic —
 * the parent {@link FeedList} owns the write and the revert — while report and
 * block live here in a small popover, since each ends by asking the parent to drop
 * the post ({@link onReported}) or the whole creator ({@link onBlocked}).
 */
export function FeedCard({
  post,
  viewerUsername,
  onLike,
  onSave,
  onFollow,
  onReported,
  onBlocked,
}: FeedCardProps) {
  const reduced = useReducedMotion();
  // Keyed timestamp so rapid double-clicks restart the burst animation cleanly.
  const [burstAt, setBurstAt] = useState<number | null>(null);
  const displayName = post.creator.displayName ?? post.creator.username;

  function handleCoverDoubleClick() {
    setBurstAt(Date.now());
    // Like-only: mirrors the mobile pager's double-tap contract — a repeat
    // double-click celebrates but never unlikes (the button is the toggle).
    if (!post.viewer.liked) {
      onLike(post);
    }
  }

  const isOwnPost = viewerUsername !== undefined && viewerUsername === post.creator.username;
  const coverAlt = post.title
    ? `${post.title} — shared by @${post.creator.username}`
    : `A look shared by @${post.creator.username}`;

  return (
    <motion.article
      style={cardStyle}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <header style={headerStyle}>
        <Link href={`/${post.creator.username}`} style={creatorLinkStyle} aria-label={`@${post.creator.username}`}>
          <Avatar src={post.creator.avatarUrl} name={displayName} size={40} />
          <span style={creatorTextStyle}>
            <Text variant="ui" size="subhead" weight={600} as="span" style={handleColorStyle}>
              @{post.creator.username}
            </Text>
            <Text variant="caption" size="footnote" as="span" style={metaRowStyle}>
              {displayName}
              <span aria-hidden="true" style={dotStyle}>
                ·
              </span>
              {formatWhen(post.createdAt)}
            </Text>
          </span>
        </Link>

        <div style={headerActionsStyle}>
          {isOwnPost ? null : <FollowPill following={post.viewer.following} onToggle={() => onFollow(post)} />}
          <MoreMenu post={post} onReported={onReported} onBlocked={onBlocked} />
        </div>
      </header>

      {/* Double-click likes — the desktop cousin of the mobile pager's double-tap.
          Like-only (a second double-click never unlikes); the heart button stays
          the accessible/toggle path. The burst is decorative and skipped under
          reduced motion. */}
      <div style={coverFrameStyle} onDoubleClick={handleCoverDoubleClick}>
        {post.coverUrl ? (
          <Image src={post.coverUrl} alt={coverAlt} fill sizes={COVER_SIZES} style={coverImageStyle} />
        ) : (
          <span aria-hidden="true" style={coverPlaceholderStyle} />
        )}
        <AnimatePresence>
          {burstAt !== null ? (
            <motion.span
              key={burstAt}
              aria-hidden="true"
              style={heartBurstStyle}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1.15 }}
              exit={{ opacity: 0, scale: 1.3 }}
              transition={transitionFor(motionToken.springs.snappy, reduced)}
              onAnimationComplete={() => setBurstAt(null)}
            >
              ♥
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <footer style={footerStyle}>
        {post.title ? (
          // The shared look's name — editorial label, Fraunces italic (oviAccent).
          <Text variant="oviAccent" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
            {post.title}
          </Text>
        ) : null}
        <div style={engagementRowStyle}>
          <EngagementButton
            glyph={post.viewer.liked ? '♥' : '♡'}
            active={post.viewer.liked}
            label={strings.feed.rail.like}
            count={post.likeCount}
            onClick={() => onLike(post)}
          />
          <EngagementButton
            glyph={post.viewer.saved ? '★' : '☆'}
            active={post.viewer.saved}
            label={strings.feed.rail.save}
            count={post.saveCount}
            onClick={() => onSave(post)}
          />
        </div>
      </footer>
    </motion.article>
  );
}

/** Follow pill mirroring the profile's three-label pattern: reveals "Unfollow" on hover/focus. */
function FollowPill({ following, onToggle }: { following: boolean; onToggle: () => void }) {
  const [reveal, setReveal] = useState(false);
  const actionLabel = following ? strings.profile.unfollowCta : strings.profile.followCta;
  const visibleLabel = following
    ? reveal
      ? strings.profile.unfollowCta
      : strings.profile.followingState
    : strings.profile.followCta;

  return (
    <Button
      variant={following ? 'secondary' : 'primary'}
      aria-label={actionLabel}
      aria-pressed={following}
      onClick={onToggle}
      onPointerEnter={() => setReveal(true)}
      onPointerLeave={() => setReveal(false)}
      onFocus={() => setReveal(true)}
      onBlur={() => setReveal(false)}
      style={followPillStyle}
    >
      {visibleLabel}
    </Button>
  );
}

/** A like/save control: a glyph that fills when active, plus its live count. */
function EngagementButton({
  glyph,
  active,
  label,
  count,
  onClick,
}: {
  glyph: string;
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={engagementButtonStyle}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <span aria-hidden="true" style={{ ...glyphStyle, color: active ? 'var(--color-accent)' : 'var(--color-text)' }}>
        {glyph}
      </span>
      <Text variant="caption" size="footnote" weight={600} as="span" style={{ color: 'var(--color-secondary-strong)' }}>
        {compact(count)}
      </Text>
    </button>
  );
}

type MenuView = 'root' | 'report' | 'block';

/**
 * The per-post more-menu: a popover Apple's UGC rules require on every post,
 * carrying report and block. Report files against the post (and, server-side, its
 * creator); block drops the creator both ways. Both hand control back to the
 * parent on success. A transparent backdrop closes it on an outside click.
 */
function MoreMenu({
  post,
  onReported,
  onBlocked,
}: {
  post: FeedPostPayload;
  onReported: (postId: string) => void;
  onBlocked: (username: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('root');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh open always starts at the root with a clean form.
  useEffect(() => {
    if (open) {
      setView('root');
      setReason(null);
      setDetail('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const creatorName = post.creator.displayName ?? post.creator.username;

  async function submitReport() {
    if (reason === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = detail.trim();
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        // The server rejects an empty detail string — send it only when present.
        body: JSON.stringify({ postId: post.id, reason, ...(trimmed ? { detail: trimmed } : {}) }),
      });
      if (!res.ok) throw new Error(`report ${res.status}`);
      setOpen(false);
      onReported(post.id);
    } catch {
      setError(strings.errors.generic);
      setBusy(false);
    }
  }

  async function confirmBlock() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: post.creator.username }),
      });
      if (!res.ok) throw new Error(`block ${res.status}`);
      setOpen(false);
      onBlocked(post.creator.username);
    } catch {
      setError(strings.errors.generic);
      setBusy(false);
    }
  }

  return (
    <div style={menuWrapStyle}>
      <button
        type="button"
        style={moreButtonStyle}
        aria-label={strings.feed.rail.more}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open ? (
        <>
          {/* Transparent click-away layer. */}
          <button type="button" aria-hidden="true" tabIndex={-1} style={backdropStyle} onClick={() => setOpen(false)} />
          <div role="menu" style={popoverStyle}>
            {view === 'root' ? (
              <div style={menuColStyle}>
                <button type="button" role="menuitem" style={menuItemStyle} onClick={() => setView('report')}>
                  <Text variant="ui" size="subhead" weight={600} as="span">
                    {strings.feed.reportTitle}
                  </Text>
                </button>
                <button type="button" role="menuitem" style={menuItemDangerStyle} onClick={() => setView('block')}>
                  <Text variant="ui" size="subhead" weight={600} as="span" style={{ color: 'var(--color-rust)' }}>
                    {strings.feed.blockTitle(creatorName)}
                  </Text>
                </button>
              </div>
            ) : null}

            {view === 'report' ? (
              <div style={menuColStyle}>
                <Text variant="ui" size="subhead" weight={700} as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
                  {strings.feed.reportTitle}
                </Text>
                <div style={chipRowStyle}>
                  {REPORT_REASONS.map((value) => (
                    <Chip key={value} selected={reason === value} onClick={() => setReason(value)}>
                      {strings.feed.reportReasons[value]}
                    </Chip>
                  ))}
                </div>
                <textarea
                  className="era-input"
                  style={detailStyle}
                  placeholder={strings.feed.reportDetailPlaceholder}
                  aria-label={strings.feed.reportDetailPlaceholder}
                  value={detail}
                  maxLength={REPORT_DETAIL_MAX}
                  disabled={busy}
                  onChange={(event) => setDetail(event.target.value)}
                />
                {error ? (
                  <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-rust)' }}>
                    {error}
                  </Text>
                ) : null}
                <Button
                  variant="primary"
                  disabled={reason === null || busy}
                  onClick={() => void submitReport()}
                  style={fullWidthStyle}
                >
                  {strings.feed.reportSubmit}
                </Button>
              </div>
            ) : null}

            {view === 'block' ? (
              <div style={menuColStyle}>
                <Text variant="ui" size="subhead" weight={700} as="p" style={{ margin: 0, color: 'var(--color-text)' }}>
                  {strings.feed.blockTitle(creatorName)}
                </Text>
                <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
                  {strings.feed.blockBody}
                </Text>
                {error ? (
                  <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-rust)' }}>
                    {error}
                  </Text>
                ) : null}
                <Button variant="secondary" disabled={busy} onClick={() => void confirmBlock()} style={fullWidthStyle}>
                  {strings.feed.blockCta}
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e1)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const creatorLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minWidth: 0,
  textDecoration: 'none',
  color: 'var(--color-text)',
};

const creatorTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
};

const handleColorStyle: CSSProperties = {
  color: 'var(--color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  color: 'var(--color-secondary-strong)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dotStyle: CSSProperties = { color: 'var(--color-secondary-strong)' };

const headerActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexShrink: 0,
};

const followPillStyle: CSSProperties = {
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  fontSize: typeRamp.footnote.rem,
};

const coverFrameStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: layout.itemCard.aspectRatio,
  width: '100%',
  background: 'var(--color-bg)',
  borderRadius: 'var(--radius-input)',
  overflow: 'hidden',
};

const coverImageStyle: CSSProperties = { objectFit: 'contain' };

/** The double-click heart burst — centered over the cover, purely decorative. */
const heartBurstStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '4rem',
  color: 'var(--color-text)',
  opacity: 0.85,
  pointerEvents: 'none',
  userSelect: 'none',
};

const coverPlaceholderStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-hairline) 40%, transparent)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const engagementRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
};

const engagementButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--touch-target-min)',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--color-text)',
};

const glyphStyle: CSSProperties = {
  fontSize: typeRamp.title3.rem,
  lineHeight: 1,
};

const menuWrapStyle: CSSProperties = { position: 'relative', flexShrink: 0 };

const moreButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.title3.rem,
  lineHeight: 1,
};

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  border: 'none',
  background: 'transparent',
  cursor: 'default',
  padding: 0,
};

const popoverStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + var(--space-1))',
  right: 0,
  zIndex: 50,
  width: 'min(320px, 80vw)',
  padding: 'var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e3)',
};

const menuColStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const menuItemStyle: CSSProperties = {
  minHeight: 'var(--touch-target-min)',
  padding: 'var(--space-2) var(--space-3)',
  textAlign: 'left',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-input)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  cursor: 'pointer',
};

const menuItemDangerStyle: CSSProperties = {
  ...menuItemStyle,
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const detailStyle: CSSProperties = {
  width: '100%',
  minHeight: 'calc(var(--touch-target-min) * 1.6)',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  resize: 'vertical',
  // eslint-disable-next-line no-restricted-syntax -- textarea inherits the body sans stack; no brand-face declaration
  fontFamily: 'inherit',
};

const fullWidthStyle: CSSProperties = { width: '100%' };
