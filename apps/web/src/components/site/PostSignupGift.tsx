'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { glow, motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button, Input, Text, glassSurfaceStyle } from '../index';
import { OviOrb } from '../ovi';
import { track } from '../../lib/analytics';
import { transitionFor } from '../../lib/motion';
import { glowShadow } from '../../lib/glow';
import { useTheme } from '../../lib/theme';
import { exportWaitlistCard } from './waitlist-card-export';

export interface PostSignupGiftProps {
  referralCode: string;
  /** True when the email was already on the list — same gift, still a place. */
  alreadyJoined: boolean;
  /** The joiner's 1-based place in line — the hero numeral on the card. */
  position: number;
}

// Micro-copy not (yet) in the locked deck — see the note to Quill in the report.
// Kept as a named constant so a future string can replace it in one place. The
// gift heading still lands for an already-joined email (they're still in); this
// quiet note just tells them why there's no fresh confirmation to celebrate.
const ALREADY_JOINED_NOTE = "You were already on the list — here's your place.";

// Choreography beats, composed from the stagger grammar (no literals). The orb
// blooms first; the heading lands one beat later; the referral card rises two
// beats after that (a longer hold so the card reads as a separate gift, not a
// continuation of the heading).
const HEADING_DELAY_S = motionToken.stagger.delayMs / 1000; // ~0.045s after the bloom
const SUB_DELAY_S = (motionToken.stagger.delayMs * 2) / 1000;
const CARD_DELAY_S = (motionToken.stagger.delayMs * 4) / 1000;

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  alignItems: 'center',
  textAlign: 'center',
  width: '100%',
};

const orbWrapStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
};

const headingBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  alignItems: 'center',
};

const headingStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const subStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const cardStyle: CSSProperties = {
  ...glassSurfaceStyle({ shadow: 'e3', radius: 'var(--radius-card)' }),
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  width: '100%',
  padding: 'var(--space-6)',
};

const numeralStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
  lineHeight: 1,
};

const lineStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const noteStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  width: '100%',
};

/**
 * The post-signup gift (D-GIFT): submitting the waitlist should feel like
 * receiving something. The Ovi orb blooms center, "You're in." lands in Display
 * Fraunces, and then a glass card rises carrying the joiner's PLACE IN LINE set
 * large in Fraunces numerals, the referral nudge, a copy-invite button, and a
 * download button for the share card.
 *
 * The choreography is composed entirely from token timings (stagger beats +
 * springs). Under reduced motion every element is a pure fade on the
 * `reducedFadeMs` cadence — no bloom, no scale, no rise. An already-joined email
 * gets the same gift (the heading still lands) with a quiet note that they were
 * already in.
 *
 * The invite link is built from the live `window.location.origin` on mount so it
 * is correct in any environment. Copying fires `referral_copy`; downloading the
 * card fires `gift_card_downloaded`.
 */
export function PostSignupGift({ referralCode, alreadyJoined, position }: PostSignupGiftProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // The copy confirm carries a small glow bloom (the §waiting "success carries a
  // small glow bloom" grammar): the button's halo swells to peak on copy, then
  // settles. Reduced motion holds it flat. Base + pulse.amount = the peak the orb
  // and toasts use, so the whole system blooms to the same ceiling.
  const baseGlow = glow.opacity[resolved];
  const restShadow = glowShadow(baseGlow);
  const peakShadow = glowShadow(baseGlow + glow.pulse.amount);

  useEffect(() => {
    setLink(`${window.location.origin}/?ref=${referralCode}`);
  }, [referralCode]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard may be blocked (permissions / insecure context) — the link is
      // still visible in the field for manual copy, so fail quietly.
    }
    setCopied(true);
    track('referral_copy');
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function download() {
    if (downloading) return;
    setDownloading(true);
    await exportWaitlistCard({ position });
    track('gift_card_downloaded', { alreadyJoined });
    setDownloading(false);
  }

  const spring = transitionFor(motionToken.springs.gentle, reduced);
  const { bloomScale, riseYPx } = motionToken.stagger;

  // The bloom entrance for the orb: scale up from a point on the gentle spring,
  // opacity in. Reduced motion holds scale at 1 and fades only.
  const orbInitial = reduced ? { opacity: 0 } : { opacity: 0, scale: bloomScale };
  const orbAnimate = reduced ? { opacity: 1 } : { opacity: 1, scale: 1 };

  // Heading + sub + card each rise-and-fade in on the stagger cadence. Reduced
  // motion drops the rise; the delay collapses to 0 so everything fades together.
  const riseInitial = reduced ? { opacity: 0 } : { opacity: 0, y: riseYPx };
  const riseAnimate = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };

  const delayed = (seconds: number) =>
    reduced ? spring : { ...spring, delay: seconds };

  return (
    <div style={wrapStyle}>
      {/* The orb blooms center — the gift opening. */}
      <motion.div style={orbWrapStyle} initial={orbInitial} animate={orbAnimate} transition={spring}>
        <OviOrb size="panel" state="idle" />
      </motion.div>

      {/* "You're in." + the one line beneath, landing a beat after the bloom. */}
      <div style={headingBlockStyle}>
        <motion.div initial={riseInitial} animate={riseAnimate} transition={delayed(HEADING_DELAY_S)}>
          <Text variant="display" as="h2" style={headingStyle}>
            {strings.site.gift.heading}
          </Text>
        </motion.div>
        <motion.div initial={riseInitial} animate={riseAnimate} transition={delayed(SUB_DELAY_S)}>
          <Text variant="body" as="p" style={subStyle}>
            {strings.site.gift.sub}
          </Text>
        </motion.div>
      </div>

      {/* The referral card rises last: the place-in-line numeral (the hero), the
          referral nudge, and the two actions. */}
      <motion.div
        style={cardStyle}
        initial={riseInitial}
        animate={riseAnimate}
        transition={delayed(CARD_DELAY_S)}
      >
        {/* The place in line — the numeral is the hero of the card, set at the
            display step of the ramp (largest step) in the largeTitle serif role.
            positionLabel is the accessible text; the glyphs themselves are
            aria-hidden so AT reads the sentence, not a bare number. */}
        <Text
          variant="largeTitle"
          as="p"
          size="display"
          style={numeralStyle}
          aria-label={strings.site.gift.positionLabel(position)}
        >
          <span aria-hidden="true">{position}</span>
        </Text>
        {alreadyJoined ? (
          <Text variant="caption" as="p" size="footnote" style={noteStyle}>
            {ALREADY_JOINED_NOTE}
          </Text>
        ) : null}
        <Text variant="body" as="p" style={lineStyle}>
          {strings.site.referral.line}
        </Text>
        <div style={rowStyle}>
          <Input
            readOnly
            value={link}
            aria-label="Your invite link"
            onFocus={(event) => event.currentTarget.select()}
          />
          {/* The copy button, its halo blooming to peak on confirm, then
              settling. The label cross-fades to the "copied" copy on the same
              beat (AnimatePresence swap), no confetti. */}
          <motion.div
            style={{ borderRadius: 'var(--radius-input)' }}
            animate={{ boxShadow: reduced || !copied ? restShadow : peakShadow }}
            transition={spring}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={copied ? 'copied' : 'copy'}
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: bloomScale }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={spring}
              >
                <Button type="button" onClick={copy} disabled={!link} style={{ width: '100%' }}>
                  {copied ? strings.site.gift.copied : strings.site.referral.cta}
                </Button>
              </motion.div>
            </AnimatePresence>
          </motion.div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void download()}
            disabled={downloading}
            style={{ width: '100%' }}
          >
            {strings.site.gift.downloadCta}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
