'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  typeRamp,
  spacing,
  radii,
  palette,
  glow,
  motion as motionToken,
  runContrastAudit,
  type ThemeMode as PaletteMode,
} from '@era/tokens';
import {
  Button,
  Card,
  Chip,
  Container,
  EraMark,
  GlassSheet,
  Input,
  ItemSurface,
  OviFab,
  TabBar,
  type ItemSurfaceForcedState,
  type TabId,
} from '../../components';
import { Text } from '../../components/Text';
import { PageHeader } from '../../components/PageHeader';
import { glassSurfaceStyle } from '../../components/GlassPanel';
import { FailedLoad } from '../../components/FailedLoad';
import { Skeleton } from '../../components/Skeleton';
import {
  RevealStage,
  OviOrb,
  OviLoader,
  OviSuggestion,
  OviToast,
  type OviOrbState,
} from '../../components/ovi';
import { ShopCard } from '../../components/shop';
import { FeedCard } from '../../components/feed';
import { PostSignupGift } from '../../components/site';
import { QuizFlow, Reveal } from '../../components/quiz';
import { deterministicProfile, type QuizAnswers } from '@era/core/quiz';
import { strings } from '@era/core/strings';
import type { ProposedOutfit, OviSuggestion as OviSuggestionData } from '@era/core/ovi';
import type { RankedProduct } from '@era/core/shop';
import type { FeedPostPayload } from '@era/core/feed';
import { useTheme, type ThemeMode } from '../../lib/theme';
import { themeVarStyle } from '../../lib/theme-css';
import { springTransition } from '../../lib/motion';
import { EmailPreview } from './EmailPreview';

/**
 * Design Lab v2 — a living spec sheet. Every section renders its content TWICE,
 * side by side: a light island and a dark island. Each island is a `<div>` whose
 * inline style applies `themeVarStyle(mode)` — the exact same `--var` set the
 * app emits for `[data-theme]`, but scoped to that subtree — so everything inside
 * resolves to that mode regardless of the page's own theme. The single global
 * light/dark/system chip row (top) still themes the page chrome; the islands are
 * what let you eyeball both recipes at once (crucially the mode-specific shadow
 * and glass recipes, which a single-theme page can't show together).
 *
 * The page is a public route but dev-facing. No client data fetches; every value
 * is a token or a deterministic, asset-free render.
 */

/** The two faces we render every section in. */
const ISLAND_MODES: readonly PaletteMode[] = ['light', 'dark'];

/** The seven type roles the system exposes (Text `variant`s). */
const TYPE_ROLES = ['display', 'largeTitle', 'title', 'oviAccent', 'body', 'ui', 'caption'] as const;

/** The seven themed colour roles + the mode-independent semantics. */
const PALETTE_ROLES = [
  'bg',
  'surface',
  'text',
  'secondary',
  'secondaryStrong',
  'accent',
  'hairline',
] as const;

const SPRING_NAMES = ['gentle', 'snappy', 'fluid'] as const;

// ---------------------------------------------------------------------------
// Item Engine specimen assets
// ---------------------------------------------------------------------------

/** The six garment categories the specimen matrix rows through. */
const ITEM_CATEGORIES = ['top', 'bottom', 'shoes', 'outerwear', 'dress', 'accessory'] as const;

/** The four forced visual states the specimen matrix columns through. */
const ITEM_STATES: readonly ItemSurfaceForcedState[] = ['rest', 'lift', 'tilt', 'selected'];

// The real cutouts (transparent-PNG garments on no ground) live at
// /design-lab/cutouts/{category}.png but are NOT generated yet (blocked on an
// expired connector). Until they land, each specimen falls back to a distinct
// existing quiz image as a stand-in via <img onError>. Swap-in path: drop the
// six PNGs into apps/web/public/design-lab/cutouts/ — no code change.
const CUTOUT_SRC: Record<(typeof ITEM_CATEGORIES)[number], string> = {
  top: '/design-lab/cutouts/top.png',
  bottom: '/design-lab/cutouts/bottom.png',
  shoes: '/design-lab/cutouts/shoes.png',
  outerwear: '/design-lab/cutouts/outerwear.png',
  dress: '/design-lab/cutouts/dress.png',
  accessory: '/design-lab/cutouts/accessory.png',
};
const CUTOUT_FALLBACK: Record<(typeof ITEM_CATEGORIES)[number], string> = {
  top: '/quiz/s1_minimal.jpg',
  bottom: '/quiz/s3_relaxed.jpg',
  shoes: '/quiz/s6_loafers.jpg',
  outerwear: '/quiz/s10_longcoat.jpg',
  dress: '/quiz/s4_soft.jpg',
  accessory: '/quiz/s7_signature.jpg',
};

// ---------------------------------------------------------------------------
// Theme islands
// ---------------------------------------------------------------------------

/**
 * A subtree forced to one theme. Applies the mode's full `--var` set, then a
 * base bg/text so the island reads as a real page surface in that mode.
 */
function ThemeIsland({ mode, children }: { mode: PaletteMode; children: ReactNode }) {
  return (
    <div
      data-island-mode={mode}
      style={{
        ...themeVarStyle(mode),
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--color-hairline)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        minWidth: 0,
      }}
    >
      <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
        {mode}
      </Text>
      {children}
    </div>
  );
}

const pairGridStyle: CSSProperties = {
  display: 'grid',
  // Two columns wide; stacks to one on narrow viewports.
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, var(--feed-col)), 1fr))',
  gap: 'var(--space-4)',
};

/**
 * Render `content(mode)` inside a light island and a dark island, side by side.
 * The render function receives the island's mode so a section can, e.g., label
 * hex values from the matching palette.
 */
function IslandPair({ content }: { content: (mode: PaletteMode) => ReactNode }) {
  return (
    <div style={pairGridStyle}>
      {ISLAND_MODES.map((mode) => (
        <ThemeIsland key={mode} mode={mode}>
          {content(mode)}
        </ThemeIsland>
      ))}
    </div>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
  borderTop: '1px solid var(--color-hairline)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-4)',
  alignItems: 'flex-end',
};

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <Text variant="title" as="h2" size="title2" style={{ margin: 0 }}>
        {title}
      </Text>
      {note ? (
        <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)' }}>
          {note}
        </Text>
      ) : null}
      {children}
    </section>
  );
}

function Swatch({ label, box }: { label: string; box: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' }}>
      <div style={box} />
      <Text variant="caption" as="span" style={{ color: 'var(--color-secondary)' }}>
        {label}
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand mark — the locked 'era.' cut, shown in both inks and with its rules.
// ---------------------------------------------------------------------------

// A small tile carrying the opposite ink so BOTH inks read on EVERY island: the
// ink mark reads on the cream island, the cream mark on the ink island; the tile
// supplies the contrasting field the on-bg mark can't (it uses --color-bg /
// --color-ink, both tokens — no literal hex, so the lab keeps to the token rule).
function InkTile({ background, children }: { background: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        background,
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--color-hairline)',
      }}
    >
      {children}
    </div>
  );
}

function BrandMarkIsland({ mode }: { mode: PaletteMode }) {
  // The on-bg ink for THIS island: ink on the light (cream) island, cream on the
  // dark (ink) island — the two-ink brand's mode choice.
  const onBg: 'ink' | 'cream' = mode === 'dark' ? 'cream' : 'ink';
  const opposite: 'ink' | 'cream' = onBg === 'ink' ? 'cream' : 'ink';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Both inks, each on the field that makes it read. */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <InkTile background="var(--color-bg)">
          <EraMark variant={onBg} heightPx={44} />
        </InkTile>
        <InkTile background={onBg === 'ink' ? 'var(--color-ink)' : 'var(--color-bg)'}>
          <EraMark variant={opposite} heightPx={44} />
        </InkTile>
      </div>

      {/* Clear-space rule: a hairline box around the mark with a per-side margin of
          ≈0.1× the mark's width (3× the period's diameter). The inner mark sits
          inside that reserved margin so the exclusion zone is visible. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div
          style={{
            display: 'inline-flex',
            // ≈0.1× the mark's width per side. The mark is 44px tall ≈ 139px wide
            // (44 × 2914.7/921); 0.1× width ≈ 14px of clear space each side.
            padding: '14px',
            border: '1px dashed var(--color-hairline)',
            borderRadius: 'var(--radius-chip)',
            alignSelf: 'flex-start',
          }}
        >
          <EraMark variant={onBg} heightPx={44} />
        </div>
        <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
          clear space ≈ 0.1× width per side (3× the period diameter)
        </Text>
      </div>

      {/* Min-size row: the 16px inline floor beside a comfortable size. */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' }}>
          <EraMark variant={onBg} heightPx={16} />
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            16px · web min
          </Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' }}>
          <EraMark variant={onBg} heightPx={32} />
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            32px
          </Text>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post-signup gift specimen — the D-GIFT choreography with a fixture position.
// This state is otherwise unreachable without actually signing up, so the lab
// earns it: the choreography IS the specimen, replayed by remounting the tree
// under a fresh key. `alreadyJoined` is false — the ordinary, celebratory path.
// ---------------------------------------------------------------------------

/** A believable place-in-line for the fixture; large enough to read as real. */
const GIFT_FIXTURE_POSITION = 214;

function GiftSpecimen() {
  // The key bumps on Replay so the whole gift remounts and re-runs its staged
  // entrance from the top — the bloom, the heading, the card rise.
  const [runKey, setRunKey] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <Button variant="secondary" onClick={() => setRunKey((k) => k + 1)}>
          Replay
        </Button>
      </div>
      <div style={{ maxWidth: 'var(--feed-col)' }}>
        <PostSignupGift
          key={runKey}
          referralCode="ERA00214"
          alreadyJoined={false}
          position={GIFT_FIXTURE_POSITION}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Busy-imagery panel — a deterministic, asset-free "photographically busy"
// background so glass legibility over real imagery is verifiable with no
// bundled photo. Layered feTurbulence noise over 3 vivid diagonal gradients,
// encoded as an SVG data-URI. Swap path: replace `busyDataUri` with a bundled
// photograph (e.g. a `next/image` or a `background-image:url(...)`) if a real
// photo is ever wanted — the glass panel over it stays exactly as-is.
// ---------------------------------------------------------------------------
const BUSY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff5e62"/>
      <stop offset="1" stop-color="#7b2ff7"/>
    </linearGradient>
    <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#00c6ff"/>
      <stop offset="1" stop-color="#00ff87"/>
    </linearGradient>
    <linearGradient id="g3" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#f7971e"/>
      <stop offset="1" stop-color="#ffd200"/>
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0.7"/>
    </filter>
  </defs>
  <rect width="600" height="400" fill="url(#g1)"/>
  <rect width="600" height="400" fill="url(#g2)" opacity="0.55" transform="rotate(18 300 200)"/>
  <rect width="600" height="400" fill="url(#g3)" opacity="0.4" transform="rotate(-24 300 200)"/>
  <rect width="600" height="400" filter="url(#noise)" opacity="0.5"/>
</svg>`;

const busyDataUri = `url("data:image/svg+xml,${encodeURIComponent(BUSY_SVG.trim())}")`;

/** The §3 glass recipe panel — reused by the Glass and Busy-imagery sections. */
const glassPanelStyle: CSSProperties = {
  ...glassSurfaceStyle(),
  padding: 'var(--space-4)',
};

/** The busy variant of the recipe — the AA-guaranteed minimum-contrast scrim. */
const glassBusyPanelStyle: CSSProperties = {
  ...glassSurfaceStyle({ busy: true }),
  padding: 'var(--space-4)',
};

// ---------------------------------------------------------------------------
// Motion playground
// ---------------------------------------------------------------------------

function SpringDemo({ name }: { name: (typeof SPRING_NAMES)[number] }) {
  const [on, setOn] = useState(false);
  const reduced = useReducedMotion();
  const spring = motionToken.springs[name];
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
      }}
      aria-label={`Toggle ${name} spring`}
    >
      <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
        {name} · stiffness {spring.stiffness} · damping {spring.damping}
      </Text>
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--feed-col)',
          height: 'var(--space-8)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--color-hairline)',
          padding: 'var(--space-1)',
        }}
      >
        <motion.div
          animate={{ x: on ? 120 : 0 }}
          transition={reduced ? { duration: motionToken.durations.reducedFadeMs / 1000 } : springTransition(spring)}
          style={{
            width: 'var(--space-6)',
            height: 'var(--space-6)',
            borderRadius: 'var(--radius-chip)',
            background: 'var(--color-accent)',
          }}
        />
      </div>
    </button>
  );
}

function MotionPlayground() {
  const reduced = useReducedMotion();
  const d = motionToken.durations;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
        {SPRING_NAMES.map((name) => (
          <SpringDemo key={name} name={name} />
        ))}
      </div>
      <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)' }}>
        Easing {motionToken.easing.css} · durations {d.minMs}–{d.maxMs}ms (reduced fade {d.reducedFadeMs}ms).
        Tap a track to spring the dot.
        {reduced
          ? ' Reduced motion is ON — springs collapse to a short fade.'
          : ' Set “Reduce motion” in your OS to see the fade fallback.'}
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WCAG contrast readout — data-driven from the token audit, grouped by mode.
// ---------------------------------------------------------------------------

type AuditRow = ReturnType<typeof runContrastAudit>[number];

function ContrastReadout() {
  const rows: readonly AuditRow[] = runContrastAudit();
  const passed = rows.filter((r) => r.pass).length;
  const byMode: Record<string, AuditRow[]> = {};
  for (const row of rows) {
    (byMode[row.mode] ??= []).push(row);
  }

  const cellStyle: CSSProperties = {
    padding: 'var(--space-2)',
    fontSize: typeRamp.footnote.rem,
    textAlign: 'left',
    borderBottom: '1px solid var(--color-hairline)',
    whiteSpace: 'nowrap',
  };
  const headStyle: CSSProperties = { ...cellStyle, color: 'var(--color-secondary)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Text variant="ui" as="strong" size="subhead">
        {passed}/{rows.length} pass
      </Text>
      {Object.entries(byMode).map(([mode, modeRows]) => (
        <div key={mode} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Text variant="caption" as="h3" size="footnote" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-secondary)' }}>
            {mode} · {modeRows.filter((r) => r.pass).length}/{modeRows.length} pass
          </Text>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['', 'id', 'fg', 'bg', 'usage', 'req', 'ratio', ''].map((h, i) => (
                    <th key={i} style={headStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modeRows.map((row) => (
                  <tr key={`${row.id}-${row.mode}`}>
                    <td style={cellStyle}>
                      <span style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                        <span style={{ width: 'var(--space-4)', height: 'var(--space-4)', borderRadius: 'var(--radius-chip)', background: row.fg, border: '1px solid var(--color-hairline)' }} />
                        <span style={{ width: 'var(--space-4)', height: 'var(--space-4)', borderRadius: 'var(--radius-chip)', background: row.bg, border: '1px solid var(--color-hairline)' }} />
                      </span>
                    </td>
                    <td style={cellStyle}>{row.id}</td>
                    <td style={cellStyle}>{row.fgKey}</td>
                    <td style={cellStyle}>{row.bgKey}</td>
                    <td style={cellStyle}>{row.usage}</td>
                    <td style={cellStyle}>{row.required}</td>
                    <td style={cellStyle}>{row.ratio.toFixed(2)}</td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          padding: 'var(--space-1) var(--space-2)',
                          borderRadius: 'var(--radius-chip)',
                          color: 'var(--color-ink)',
                          fontWeight: 600,
                          background: row.pass ? 'var(--color-sage)' : 'var(--color-rust)',
                        }}
                      >
                        {row.pass ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-island section bodies
// ---------------------------------------------------------------------------

function PaletteIsland({ mode }: { mode: PaletteMode }) {
  const p = palette[mode];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
      {PALETTE_ROLES.map((role) => (
        <div key={role} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' }}>
          <div style={{ width: 'var(--space-12)', height: 'var(--space-12)', borderRadius: 'var(--radius-card)', background: p[role], border: '1px solid var(--color-hairline)' }} />
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            {role}
          </Text>
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            {p[role]}
          </Text>
        </div>
      ))}
      {(['sage', 'rust'] as const).map((role) => (
        <div key={role} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' }}>
          <div style={{ width: 'var(--space-12)', height: 'var(--space-12)', borderRadius: 'var(--radius-card)', background: palette.semantic[role], border: '1px solid var(--color-hairline)' }} />
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            {role}
          </Text>
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            {palette.semantic[role]}
          </Text>
        </div>
      ))}
    </div>
  );
}

function TypeIsland() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {TYPE_ROLES.map((role) => (
        <div key={role} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text variant="caption" as="span" size="footnote" style={{ width: 'var(--space-16)', color: 'var(--color-secondary)' }}>
            {role}
          </Text>
          <Text variant={role} as="span">
            {role === 'oviAccent' ? 'Ovi' : 'The quiet fox'}
          </Text>
        </div>
      ))}
    </div>
  );
}

function ElevationIsland() {
  return (
    <div style={rowStyle}>
      {(['e1', 'e2', 'e3', 'e4'] as const).map((level) => (
        <Swatch
          key={level}
          label={level}
          box={{
            width: 'var(--space-16)',
            height: 'var(--space-12)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-card)',
            boxShadow: `var(--shadow-${level})`,
          }}
        />
      ))}
    </div>
  );
}

function GlassIsland() {
  return (
    <div style={{ ...glassPanelStyle, display: 'grid', placeItems: 'center', minHeight: 'var(--space-16)' }}>
      <Text variant="body" as="span" size="footnote" style={{ color: 'var(--color-text)' }}>
        glass · blur + tint + border + top highlight
      </Text>
    </div>
  );
}

function GlowIsland({ mode }: { mode: PaletteMode }) {
  const glowShadow = `0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${Math.round(glow.opacity[mode] * 100)}%, transparent)`;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
      <motion.div
        animate={{ boxShadow: [glowShadow, `0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${Math.round(glow.opacity[mode] * (1 + glow.pulse.amount) * 100)}%, transparent)`, glowShadow] }}
        transition={{ duration: glow.pulse.durationMs / 1000, repeat: Infinity, ease: motionToken.easing.bezier }}
        style={{ width: 'var(--space-16)', height: 'var(--space-16)', borderRadius: 'var(--radius-card)', background: 'var(--color-accent)', display: 'grid', placeItems: 'center', color: 'var(--color-ink)' }}
      >
        <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-ink)' }}>
          pulse
        </Text>
      </motion.div>
    </div>
  );
}

/** The three canonical sizes and three living states of Ovi's orb, side by side. */
const ORB_SIZES = ['corner', 'header', 'panel'] as const;
const ORB_STATES: readonly OviOrbState[] = ['idle', 'thinking', 'speaking'];

function OviOrbIsland() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {ORB_STATES.map((state) => (
        <div key={state} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
            {state}
          </Text>
          <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap' }}>
            {ORB_SIZES.map((size) => (
              <div key={size} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'center' }}>
                <OviOrb size={size} state={state} />
                <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
                  {size}
                </Text>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Waiting & failure moments (D-WAIT), one specimen block per island. The inline
 * and page OrbLoaders, the three shimmering skeleton variants, the error/success
 * toasts behind trigger buttons, and the editorial failed-load state — all on the
 * same tokens the app uses. Skeletons shimmer their warm-cream sweep; the toasts
 * are re-mounted per press (keyed) so the entrance replays. Reduced motion turns
 * every shimmer/pulse off and holds the toasts static (noted below the block).
 */
function WaitingMomentsIsland() {
  const reduced = useReducedMotion();
  // Each press bumps a key so the keyed toast re-mounts and its entrance replays.
  const [errorKey, setErrorKey] = useState(0);
  const [successKey, setSuccessKey] = useState(0);

  const labelStyle: CSSProperties = { color: 'var(--color-secondary)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* OrbLoaders — the inline (whisper) and page (corner) waiting states. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Text variant="caption" as="span" size="footnote" style={labelStyle}>
          OrbLoader — inline / page
        </Text>
        <OviLoader variant="inline" caption="Loading…" />
        <OviLoader variant="page" label="Loading" />
      </div>

      {/* The three skeleton variants, shimmering in warm cream. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Text variant="caption" as="span" size="footnote" style={labelStyle}>
          Skeleton — text / card / row
        </Text>
        <Skeleton variant="text" />
        <div style={{ maxWidth: 160 }}>
          <Skeleton variant="card" />
        </div>
        <Skeleton variant="row" />
      </div>

      {/* Toast triggers — error (rust hairline) + success (glow bloom). Both keyed
          so a press replays the entrance; each auto-dismisses on the 2500 cadence
          in the app, but here they hold so the grammar stays inspectable. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Text variant="caption" as="span" size="footnote" style={labelStyle}>
          Toasts — error / success
        </Text>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setErrorKey((k) => k + 1)}>
            Show error
          </Button>
          <Button variant="secondary" onClick={() => setSuccessKey((k) => k + 1)}>
            Show success
          </Button>
        </div>
        {errorKey > 0 ? (
          <OviToast key={`err-${errorKey}`} message={strings.errors.transient} variant="error" />
        ) : null}
        {successKey > 0 ? (
          <OviToast key={`ok-${successKey}`} message={strings.design.outfitSaved} variant="success" />
        ) : null}
      </div>

      {/* The editorial failed-load state (Fraunces line + one retry). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Text variant="caption" as="span" size="footnote" style={labelStyle}>
          Failed-load editorial state
        </Text>
        <FailedLoad onRetry={noop} />
      </div>

      <Text variant="caption" as="p" size="footnote" style={labelStyle}>
        Reduced motion{reduced ? ' (active)' : ''}: skeletons hold static (no
        sweep), the orb stops breathing, and toasts fade without the glow bloom.
      </Text>
    </div>
  );
}

/**
 * The ambient OviSuggestion strip (D-AMBIENT), one specimen per island. Real
 * {@link OviSuggestion} components with lab-only keys (so a lab dismiss never
 * touches a real surface's dismissed set) and no-op open/dismiss — the point is
 * to eyeball the glass strip grammar (whisper orb, italic line, quiet action, ×)
 * and its settle-delayed fade-rise in both modes. It appears ~800ms after mount,
 * exactly as it does in the app.
 */
const LAB_SUGGESTION: OviSuggestionData = {
  key: 'design-lab:specimen',
  line: strings.ovi.suggest.closetUntried(3),
  action: strings.ovi.suggest.actionShowMe,
  intent: 'today',
  itemId: null,
};

function OviSuggestionIsland() {
  return (
    <OviSuggestion
      suggestion={LAB_SUGGESTION}
      onOpen={() => {}}
      onDismiss={() => {}}
    />
  );
}

function SheenIsland() {
  return (
    <div style={{ position: 'relative', width: '100%', height: 'var(--space-16)', borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--color-accent)' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--sheen-gradient)' }} />
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--color-ink)', fontSize: typeRamp.footnote.rem }}>sheen</span>
    </div>
  );
}

function ComponentsIsland({ chips, onToggleChip }: { chips: Record<string, boolean>; onToggleChip: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.keys(chips).map((key) => (
          <Chip key={key} selected={chips[key]} onClick={() => onToggleChip(key)}>
            {key}
          </Chip>
        ))}
        {/* The D8 quiet-glass rest treatment (Chip `glass`) — a frosted pill,
            unselected. The row above is the solid-surface default for contrast. */}
        <Chip glass onClick={() => onToggleChip('glass')} selected={chips.glass ?? false}>
          glass
        </Chip>
      </div>
      <Input label="Email" placeholder="you@example.com" />
      <Card>
        <div style={{ padding: 'var(--space-4)' }}>Card (e2)</div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item Engine — the D7 hero object specimen matrix.
// ---------------------------------------------------------------------------

/**
 * Resolve a category's cutout src with a graceful fallback: attempt the real
 * cutout PNG, and on load error fall back to a distinct quiz stand-in. A hidden
 * probe <img> does the error detection so the ItemSurface always renders a src
 * that exists.
 */
function useCutoutSrc(category: (typeof ITEM_CATEGORIES)[number]): {
  src: string;
  probe: ReactNode;
} {
  const [errored, setErrored] = useState(false);
  const primary = CUTOUT_SRC[category];
  const probe = errored ? null : (
    <img
      src={primary}
      alt=""
      aria-hidden="true"
      width={1}
      height={1}
      onError={() => setErrored(true)}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  );
  return { src: errored ? CUTOUT_FALLBACK[category] : primary, probe };
}

/** One specimen cell — a forced-state ItemSurface for a category, with a label. */
function ItemSpecimen({
  category,
  state,
}: {
  category: (typeof ITEM_CATEGORIES)[number];
  state: ItemSurfaceForcedState;
}) {
  const { src, probe } = useCutoutSrc(category);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', position: 'relative' }}>
      {probe}
      <ItemSurface src={src} alt={`${category} — ${state}`} forcedState={state} />
      <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
        {state}
      </Text>
    </div>
  );
}

/** The live, fully-interactive (full tilt) specimen — one per mode island. */
function ItemLiveSpecimen({ category }: { category: (typeof ITEM_CATEGORIES)[number] }) {
  const { src, probe } = useCutoutSrc(category);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', position: 'relative', maxWidth: 'var(--space-16)' }}>
      {probe}
      <ItemSurface
        src={src}
        alt={`${category} — live, hover to tilt`}
        interactive="full"
        onPress={() => {}}
      />
      <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
        live · hover
      </Text>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shop card specimen — the product card on the Item-Engine grammar
// -----------------------------------------------------------------------------

/**
 * Three fixture picks, one per `why` kind, so the specimen shows the whole
 * whisper taxonomy in one voice: `completes_outfits` (opens Ovi), `fills_gap`
 * (taps to the detail sheet), and the honest `similar_owned` warning (whisper
 * register + rust caution). Ids are lab-scoped; `affiliateUrl` is a placeholder
 * https link so the surface reads as a live click-out. Images point at the lab
 * cutouts — a broken URL falls back to the brand initial via the card's probe,
 * so the specimen never mounts a visibly-broken <img>.
 */
const SHOP_SPECIMENS: readonly RankedProduct[] = [
  {
    id: 'lab-shop-completes',
    title: 'Merino crew knit',
    brand: 'Colhoun',
    brandTier: 'contemporary',
    category: 'top',
    price: 180,
    currency: 'USD',
    imageUrl: '/design-lab/cutouts/top.png',
    retailer: 'Colhoun',
    productUrl: 'https://colhoun.example/p/lab-shop-completes',
    affiliateUrl: 'https://colhoun.example/p/lab-shop-completes?aff=era-lab',
    score: 0.9,
    why: { kind: 'completes_outfits', count: 3 },
    whyDetail: null,
  },
  {
    id: 'lab-shop-gap',
    title: 'Camel wool trousers',
    brand: 'Vestre',
    brandTier: 'premium',
    category: 'bottom',
    price: 240,
    currency: 'USD',
    imageUrl: '/design-lab/cutouts/bottom.png',
    retailer: 'Vestre',
    productUrl: 'https://vestre.example/p/lab-shop-gap',
    affiliateUrl: 'https://vestre.example/p/lab-shop-gap?aff=era-lab',
    score: 0.82,
    why: { kind: 'fills_gap', category: 'bottom' },
    whyDetail: { completesWith: [], fillsGap: { category: 'bottom', ownedCount: 1 }, similarTo: [], paletteMatch: [] },
  },
  {
    id: 'lab-shop-similar',
    title: 'White leather sneakers',
    brand: 'Aldous',
    brandTier: 'contemporary',
    category: 'shoes',
    price: 150,
    currency: 'USD',
    imageUrl: '/design-lab/cutouts/shoes.png',
    retailer: 'Aldous',
    productUrl: 'https://aldous.example/p/lab-shop-similar',
    affiliateUrl: 'https://aldous.example/p/lab-shop-similar?aff=era-lab',
    score: 0.61,
    why: { kind: 'similar_owned', ownedCount: 2 },
    whyDetail: {
      completesWith: [],
      fillsGap: null,
      similarTo: [{ id: 'lab-owned-sneaker', label: 'white sneakers' }],
      paletteMatch: [],
    },
  },
];

/**
 * The Shop card on the Item-Engine grammar, in one mode island: the product photo
 * AS the hero object (ItemSurface — 4:5, hairline, dual-e3, sheen, warm tone,
 * hover lift), the brand/title/price beneath, and the why as Ovi's whisper (the
 * 20px orb + a Fraunces-Italic line) across all three kinds. Save/dismiss are
 * live but lab-scoped (no wishlist writes land for these ids).
 */
function ShopCardIsland() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
      {SHOP_SPECIMENS.map((product) => (
        <ShopCard
          key={product.id}
          product={product}
          isSaved={false}
          onToggleSave={() => {}}
          onDismiss={() => {}}
          onWhyCompletesOpen={() => {}}
        />
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Canvas physics specimen — the drag lift + hairline snap guide, static
// -----------------------------------------------------------------------------

/**
 * A still frame of the outfit-canvas drag physics: a 4:5 "paper" surface with a
 * centre hairline snap guide (var(--color-hairline), 1px) crossing it, and one
 * piece parked on the guide carrying the e3 "item" shadow — the lift a dragged
 * piece holds while it's picked up. Static: no drag, no motion; it just shows the
 * two resting-state values (the guide colour and the lift shadow) the live canvas
 * animates in on drag-start and settles out on release.
 */
function CanvasPhysicsIsland() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={canvasPaperStyle}>
        {/* Centre snap guides — the exact hairline treatment CanvasStage draws. */}
        <span aria-hidden="true" style={canvasGuideVStyle} />
        <span aria-hidden="true" style={canvasGuideHStyle} />
        {/* A piece parked on the guide, lifted on the e3 shadow (drag-held state). */}
        <div style={canvasPieceStyle}>
          <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary-strong)' }}>
            top
          </Text>
        </div>
      </div>
      <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)' }}>
        Drag physics (static): a piece lifts onto <code>var(--shadow-e3)</code> while dragged (fluid
        spring in, settling out on release), and snap guides render as 1px{' '}
        <code>var(--color-hairline)</code> rules. Under reduced motion the lift hard-sets.
      </Text>
    </div>
  );
}

// The 4:5 canvas "paper" (CanvasStage.paperStyle) sized for the specimen.
const canvasPaperStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: '4 / 5',
  maxWidth: 'var(--space-16)',
  overflow: 'hidden',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-sheet)',
  border: '1px solid var(--color-hairline)',
};

// The snap guides: the exact 1px hairline rules CanvasStage draws while snapping.
const canvasGuideVStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  width: 1,
  height: '100%',
  background: 'var(--color-hairline)',
};
const canvasGuideHStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: 0,
  height: 1,
  width: '100%',
  background: 'var(--color-hairline)',
};

// A piece parked on the centre guide, carrying the e3 drag-lift shadow — the
// resting frame of what a dragged piece holds.
const canvasPieceStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '45%',
  aspectRatio: '4 / 5',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-hairline)',
  boxShadow: 'var(--shadow-e3)',
};

// -----------------------------------------------------------------------------
// Reveal ritual specimen (D9) — a replayable Today's Look reveal on lab assets.
// -----------------------------------------------------------------------------

/**
 * The five lab cutouts cast as a real ItemsById map, in the stylist's slot
 * vocabulary (bag → the accessory slot). Ids are lab-scoped on purpose: the
 * settled card's actions call the REAL endpoints, and since these ids are not
 * in anyone's closet, "Wear it" declines honestly server-side — the specimen
 * can never write fake data.
 */
const REVEAL_LAB_ITEMS: ReadonlyMap<string, { displayUrl: string; name: string; category: string }> =
  new Map([
    ['lab-shoes', { displayUrl: '/design-lab/cutouts/shoes.png', name: 'White leather sneakers', category: 'shoes' }],
    ['lab-bottom', { displayUrl: '/design-lab/cutouts/bottom.png', name: 'Camel wool trousers', category: 'bottom' }],
    ['lab-top', { displayUrl: '/design-lab/cutouts/top.png', name: 'Cream cashmere knit', category: 'top' }],
    ['lab-outerwear', { displayUrl: '/design-lab/cutouts/outerwear.png', name: 'Camel overcoat', category: 'outerwear' }],
    ['lab-accessory', { displayUrl: '/design-lab/cutouts/accessory.png', name: 'Tan leather tote', category: 'bag' }],
  ]);

const REVEAL_LAB_OUTFIT: ProposedOutfit = {
  name: "Today's look",
  occasion: 'today',
  itemIds: ['lab-top', 'lab-bottom', 'lab-shoes', 'lab-outerwear', 'lab-accessory'],
  rationale: 'A lab look — five pieces so the full slot order plays.',
};

const REVEAL_LAB_LINE = '18° and sunny — the cream cashmere knit wants out.';
const REVEAL_LAB_WEATHER = { tempC: 18, condition: 'Sunny' };

/**
 * One replayable reveal per island: the full staged ritual (cream canvas →
 * assembly → settle) on the lab cutouts, with no once-per-day gate — the
 * Replay button remounts the stage via a key so the sequence runs again.
 * Reduced motion shows the cross-fade version, exactly as in the app.
 */
function RevealRitualIsland() {
  const [run, setRun] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <RevealStage
        key={run}
        outfit={REVEAL_LAB_OUTFIT}
        itemsById={REVEAL_LAB_ITEMS}
        revealLine={REVEAL_LAB_LINE}
        weather={REVEAL_LAB_WEATHER}
        onToast={(message) => setNote(message)}
        onDismissed={() => setNote('Dismissed — replay to stage it again.')}
      />
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => { setNote(null); setRun((n) => n + 1); }}>
          Replay the reveal
        </Button>
        {note ? (
          <Text variant="caption" as="span" size="footnote" style={{ margin: 0, color: 'var(--color-secondary-strong)' }} role="status">
            {note}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Style quiz specimen (D-QUIZ) — the REAL, replayable quiz → reveal flow, so the
// restyle is a living surface you can always run and tweak. It embeds the actual
// QuizFlow; on completion it computes the profile with the pure, API-free
// `deterministicProfile` (@era/core/quiz) and renders the REAL Reveal against it
// (profileOverride bypasses the derivation fetch — no session, no network). The
// CTA is inert here; Replay remounts the flow at step 1 via a key bump. The
// column is capped to the feed width and given a min-height so completing the
// quiz doesn't reflow the whole page.
// -----------------------------------------------------------------------------

function QuizLabIsland() {
  const [run, setRun] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers | null>(null);

  const replay = () => {
    setAnswers(null);
    setRun((n) => n + 1);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 'var(--feed-col)',
        marginInline: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {/* Contain the flow's height so completing it doesn't fight the page. */}
      <div style={{ minHeight: 'var(--space-16)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {answers ? (
          <Reveal
            key={`reveal-${run}`}
            answers={answers}
            profileOverride={deterministicProfile(answers)}
            inertCta
          />
        ) : (
          <QuizFlow
            key={`flow-${run}`}
            onComplete={(collected) => setAnswers(collected)}
            onSkip={replay}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <Button variant="secondary" onClick={replay}>
          Replay the quiz
        </Button>
        <Text variant="caption" as="span" size="footnote" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
          {answers ? 'Reveal from deterministicProfile — CTA inert in the lab.' : 'Answer through to the reveal.'}
        </Text>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Public feed frame specimen (D-FEED, Part B) — the FLAGGED direction, shown
// WITHOUT flipping the flag. One re-skinned FeedCard on fixture data so the
// "TikTok's hierarchy, Era's materials" anatomy (full-bleed cover + cream
// letterbox + right glass rail + Fraunces-italic name overlay) is visible in the
// lab. The rail is inert here: every handler is a no-op, so nothing writes.
// -----------------------------------------------------------------------------

/** Fixture post for the flagged frame — a lab cutout cover, a fake editorial creator. */
const FEED_FRAME_FIXTURE: FeedPostPayload = {
  id: 'lab-feed-frame',
  type: 'outfit',
  // A quiz stand-in guarantees the specimen paints even before real cutouts land.
  coverUrl: '/quiz/s10_longcoat.jpg',
  title: 'Camel season',
  creator: { username: 'era.editorial', displayName: 'Era Editorial', avatarUrl: null },
  likeCount: 1240,
  saveCount: 86,
  viewer: { liked: false, saved: true, following: false },
  // A fixed, recent-ish timestamp so the caption reads a stable "2d".
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

/** No-op — the specimen rail is inert; it never calls the real feed endpoints. */
function noop() {
  /* inert */
}

/**
 * One specimen of the flagged public-feed card per island. It renders the SAME
 * {@link FeedCard} the flag path uses, on {@link FEED_FRAME_FIXTURE}, capped to
 * the feed column so it reads at its real width. All actions are wired to no-ops
 * — this is how the flagged direction is SEEN without turning ERA_FEED_ENABLED on.
 */
function PublicFeedFrameIsland() {
  return (
    <div style={{ width: '100%', maxWidth: 'var(--feed-col)', marginInline: 'auto' }}>
      <FeedCard
        post={FEED_FRAME_FIXTURE}
        onLike={noop}
        onSave={noop}
        onFollow={noop}
        onReported={noop}
        onBlocked={noop}
      />
    </div>
  );
}

/**
 * The Item Engine matrix inside one mode island: rows = the six garment
 * categories, columns = the four forced states (rest / lift / tilt / selected),
 * plus one live full-tilt specimen. Cutouts fall back to quiz stand-ins until
 * the real PNGs land in public/design-lab/cutouts/.
 */
function ItemEngineIsland() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {ITEM_CATEGORIES.map((category) => (
        <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Text variant="caption" as="h3" size="footnote" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-secondary)' }}>
            {category}
          </Text>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${ITEM_STATES.length}, minmax(0, 1fr))`,
              gap: 'var(--space-3)',
            }}
          >
            {ITEM_STATES.map((state) => (
              <ItemSpecimen key={state} category={category} state={state} />
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-hairline)' }}>
        <ItemLiveSpecimen category="outerwear" />
        <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)', flex: 1 }}>
          Live specimen — move a pointer over it to tilt ≤7° + parallax + sheen slide; hover/press
          raises it (the hero lift). Cutouts are quiz-image stand-ins; real garment PNGs swap in via{' '}
          <code>public/design-lab/cutouts/</code>.
        </Text>
      </div>
    </div>
  );
}

function BusyImageryIsland() {
  // Two panels over the SAME busy backdrop: DEFAULT glass (everyday tint) and
  // BUSY glass (the AA-guaranteed scrim). The dark-island busy panel is the
  // visible proof the scrim holds — its default sibling can wash out over the
  // brightest patch, the busy one stays legible. Sample text is body role.
  return (
    <div
      style={{
        position: 'relative',
        minHeight: 'var(--space-16)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        backgroundImage: busyDataUri,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'grid',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
      }}
    >
      <div style={{ ...glassPanelStyle, maxWidth: 'var(--feed-col)' }}>
        <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          default glass
        </Text>
        <Text variant="body" as="p" style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text)' }}>
          The everyday tint, over deliberately busy imagery.
        </Text>
      </div>
      <div style={{ ...glassBusyPanelStyle, maxWidth: 'var(--feed-col)' }}>
        <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          busy glass · AA scrim
        </Text>
        <Text variant="body" as="p" style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text)' }}>
          The minimum-contrast scrim — legible over any backdrop.
        </Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glass conversation (D3.2 + parity) — the Ovi panel's anatomy, live.
// A lab-scoped island rendering the conversation grammar INSIDE the real glass
// recipe: the header orb + 'Ovi' accent + quiet close, a user bubble, Ovi's
// editorial reply that WORD-STREAMS on Replay (the exact stream.wordMs cadence +
// glowing caret with caretDimOpacity blink from OviChat), the three canonical
// chips, and the glass input row with the pressing send. All inert / toast-noop.
// The streaming internals are private to OviChat, so they're replicated here
// minimally against the same tokens — no private export just for the lab.
// ---------------------------------------------------------------------------

/** Ovi's scripted reply — honest, short, in her voice (lab-scoped literal). */
const CONVO_USER_LINE = 'What do I wear today?';
const CONVO_OVI_REPLY =
  '18° and sunny — the cream knit with your straight-leg denim, white sneakers to keep it easy.';

/** Split a reply into word+trailing-whitespace tokens — mirrors OviChat's
 *  streamTokens so the reveal cadence and spacing match the real panel. */
function convoStreamTokens(reply: string): string[] {
  return reply.match(/\S+\s*/g) ?? [];
}

/** The panel's glass recipe at panel scale: the full §3 surface (blur + tint +
 *  1px border + top highlight + e4), sheet radius, with the panel's own inset
 *  padding. Same composition OviChat's panelStyle uses. */
const convoPanelStyle: CSSProperties = {
  ...glassSurfaceStyle(),
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
};

const convoHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const convoCloseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-secondary-strong)',
  cursor: 'pointer',
  fontSize: typeRamp.title3.rem,
};

const convoUserBubbleStyle: CSSProperties = {
  alignSelf: 'flex-end',
  maxWidth: '82%',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-text)',
};

// Ovi's reply is editorial text straight on the glass — no bubble, comfortable measure.
const convoReplyStyle: CSSProperties = {
  margin: 0,
  maxWidth: '62ch',
  color: 'var(--color-text)',
};

// The soft accent caret at the streaming insertion point (OviChat's cursorStyle).
const convoCaretStyle: CSSProperties = {
  display: 'inline-block',
  width: 'var(--glass-border-width)',
  height: '1em',
  marginLeft: 'var(--space-1)',
  verticalAlign: 'text-bottom',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-accent)',
};

const convoChipsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
};

const convoFormStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-2)',
};

/**
 * One replayable glass conversation per island. The reply reveals word by word
 * at `stream.wordMs` while the header orb holds SPEAKING for exactly that window,
 * then settles to IDLE; a glowing caret blinks on the same cadence at the
 * insertion point. Replay remounts via a key (the Reveal-ritual pattern). Under
 * reduced motion the reply appears whole and the orb holds idle. Everything the
 * user can touch — the chips, the send, the close — is inert or a toast-noop.
 */
function GlassConversationIsland() {
  const [run, setRun] = useState(0);
  return <GlassConversationRun key={run} onReplay={() => setRun((n) => n + 1)} />;
}

function GlassConversationRun({ onReplay }: { onReplay: () => void }) {
  const reduced = useReducedMotion();
  const tokens = convoStreamTokens(CONVO_OVI_REPLY);
  // How many word-tokens of the reply have landed. Reduced motion → all at once.
  const [shown, setShown] = useState(reduced ? tokens.length : 1);
  const [orbState, setOrbState] = useState<OviOrbState>(reduced ? 'idle' : 'speaking');
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drive the word stream on mount, holding SPEAKING for the reveal's length,
  // then settling to IDLE — the OviChat startStream shape, lab-minimal.
  useEffect(() => {
    if (reduced || tokens.length <= 1) {
      setOrbState('idle');
      return;
    }
    const tick = (count: number) => {
      if (count >= tokens.length) {
        setOrbState('idle');
        return;
      }
      timer.current = setTimeout(() => {
        setShown(count + 1);
        tick(count + 1);
      }, motionToken.stream.wordMs);
    };
    tick(1);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Runs once per mount — Replay remounts via key to replay the stream.
  }, [reduced]);

  const isStreaming = !reduced && shown < tokens.length;
  const shownText = tokens.slice(0, shown).join('');

  const chips = [
    strings.ovi.intentChips.today,
    strings.ovi.intentChips.styleItem,
    strings.ovi.intentChips.whatsMissing,
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={convoPanelStyle}>
        <header style={convoHeaderStyle}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <OviOrb size="header" state={orbState} />
            <Text variant="oviAccent" as="span" style={{ margin: 0 }}>
              {strings.ovi.fabLabel.split(',')[0]}
            </Text>
          </div>
          <button type="button" style={convoCloseStyle} aria-label={strings.common.cancel} disabled>
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div style={convoUserBubbleStyle}>
          <Text variant="body" as="p" style={{ margin: 0, color: 'inherit' }}>
            {CONVO_USER_LINE}
          </Text>
        </div>

        <Text variant="body" as="p" style={convoReplyStyle}>
          {shownText}
          {isStreaming ? (
            <motion.span
              aria-hidden="true"
              style={convoCaretStyle}
              animate={{ opacity: [1, glow.caretDimOpacity, 1] }}
              transition={{
                duration: motionToken.stream.wordMs / 1000,
                repeat: Infinity,
                ease: motionToken.easing.bezier,
              }}
            />
          ) : null}
        </Text>

        <div style={convoChipsRowStyle}>
          {chips.map((label) => (
            <Chip key={label} glass onClick={() => setNote('Chip is inert in the lab.')}>
              {label}
            </Chip>
          ))}
        </div>

        <form style={convoFormStyle} onSubmit={(e) => e.preventDefault()}>
          <div style={{ flex: 1 }}>
            <Input
              aria-label={strings.ovi.chatPlaceholder}
              placeholder={strings.ovi.chatPlaceholder}
              disabled
            />
          </div>
          <Button type="submit" variant="primary" aria-label={strings.common.continue} disabled>
            <span aria-hidden="true">→</span>
          </Button>
        </form>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <Button variant="secondary" onClick={onReplay}>
          Replay the reply
        </Button>
        {note ? (
          <Text variant="caption" as="span" size="footnote" style={{ margin: 0, color: 'var(--color-secondary-strong)' }} role="status">
            {note}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header choreography (D6) — the real PageHeader inside both islands, with a
// Replay: title rises 8px, subtitle trails 60ms (motion.headerRise). The two phi
// gaps (header-below 32 / section-above 52) render as labeled spacer bars, the
// way the Spacing section reads its values.
// ---------------------------------------------------------------------------

/** A labeled vertical spacer bar — height set by a rhythm var, so the phi gaps
 *  read visually the way the Spacing swatches read their spacing tokens. */
function RhythmBar({ label, heightVar }: { label: string; heightVar: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div
        style={{
          width: 'var(--space-2)',
          height: heightVar,
          background: 'var(--color-accent)',
          borderRadius: 'var(--radius-chip)',
          flex: 'none',
        }}
      />
      <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
        {label}
      </Text>
    </div>
  );
}

function HeaderChoreographyIsland() {
  const [run, setRun] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* The real PageHeader — it replays its rise on each mount, so the key bumps it. */}
      <PageHeader key={run} title="Closet" subtitle={strings.closet.subtitle} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <RhythmBar label="--rhythm-header-below · 32 (header → first section)" heightVar="var(--rhythm-header-below)" />
        <RhythmBar label="--rhythm-section-above · 52 (between sections)" heightVar="var(--rhythm-section-above)" />
      </div>
      <div>
        <Button variant="secondary" onClick={() => setRun((n) => n + 1)}>
          Replay the rise
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editorial closet (D8) — the closet's editorial grammar as a specimen: the real
// Fraunces-Italic section label + hairline rule (ClosetGallery's treatment), a
// live density toggle (lab-local, toggling the grid's column count between the
// two density values), and the cost-per-wear line in Fraunces numerals
// (ItemWearStats' treatment). Read against real cutouts in ItemSurface tiles.
// ---------------------------------------------------------------------------

// The editorial section heading (ClosetGallery.sectionHeadingStyle): italic
// serif label left, a hairline rule filling the row to the right.
const closetHeadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};
const closetHairlineStyle: CSSProperties = {
  flex: 1,
  height: 'var(--glass-border-width)',
  background: 'var(--color-hairline)',
};

/** Cost-per-wear figure (ItemWearStats): the amount in Fraunces numerals (title
 *  role) over a quiet "per wear" caption, held tight as one editorial unit. */
function CostPerWearFigure({ amount }: { amount: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <Text variant="title" as="span" style={{ margin: 0, color: 'var(--color-text)' }}>
        {amount}
      </Text>
      <Text variant="caption" size="footnote" as="span" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
        {strings.closet.costPerWearLabel}
      </Text>
    </div>
  );
}

// Three cutouts read against the label/rule/density — the tops-ish trio.
const CLOSET_SPECIMEN_CATEGORIES = ['top', 'outerwear', 'shoes'] as const;

function EditorialClosetIsland() {
  // Lab-local density — NOT persisted. 'comfortable' shows two columns, 'compact'
  // three, toggling the specimen grid's column count the way the real gallery does.
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const columns = density === 'comfortable' ? 2 : 3;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          selected={density === 'comfortable'}
          aria-label={strings.closet.densityComfortable}
          onClick={() => setDensity('comfortable')}
        >
          {strings.closet.densityComfortable}
        </Chip>
        <Chip
          selected={density === 'compact'}
          aria-label={strings.closet.densityCompact}
          onClick={() => setDensity('compact')}
        >
          {strings.closet.densityCompact}
        </Chip>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={closetHeadingStyle}>
          <Text variant="oviAccent" as="h3" style={{ margin: 0 }}>
            {strings.closet.categoryLabel('top')}
          </Text>
          <span aria-hidden="true" style={closetHairlineStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 'var(--space-3)' }}>
          {CLOSET_SPECIMEN_CATEGORIES.map((category) => (
            <EditorialClosetTile key={category} category={category} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-hairline)' }}>
        <CostPerWearFigure amount="$4.20" />
        <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)', flex: 1 }}>
          The detail-sheet cost-per-wear treatment: the amount in Fraunces numerals over its quiet
          label. Toggle density above to reflow the grid ({columns} columns) — lab-local, not persisted.
        </Text>
      </div>
    </div>
  );
}

/** One cutout in an ItemSurface tile — real cutout with the quiz-image fallback. */
function EditorialClosetTile({ category }: { category: (typeof ITEM_CATEGORIES)[number] }) {
  const { src, probe } = useCutoutSrc(category);
  return (
    <div style={{ position: 'relative' }}>
      {probe}
      <ItemSurface src={src} alt={`${category} — editorial closet specimen`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DesignLabPage() {
  const { mode, resolved, setMode } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('design');
  const [chips, setChips] = useState<Record<string, boolean>>({ linen: true, wool: false, silk: false });
  const toggleChip = (key: string) => setChips((c) => ({ ...c, [key]: !c[key] }));

  return (
    <main style={{ paddingBottom: 'calc(var(--tabbar-height) + var(--space-16))' }}>
      <Container>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBlock: 'var(--space-8)' }}>
          <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
            Era design lab
          </Text>
          <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary)' }}>
            Every section renders light | dark side by side via theme islands. The chips below theme the page
            chrome; the islands are independent.
          </Text>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
              <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
                {m}
              </Chip>
            ))}
            <Text variant="caption" as="span" size="footnote" style={{ alignSelf: 'center', color: 'var(--color-secondary)' }}>
              resolved: {resolved}
            </Text>
          </div>
        </header>

        <Section title="Palette" note="Seven themed roles + the mode-independent semantic hues, with hex labels.">
          <IslandPair content={(m) => <PaletteIsland mode={m} />} />
        </Section>

        <Section
          title="Brand mark"
          note="The locked 'era.' mark — vector paths cut from Fraunces (opsz 144, wght 620, WONK 0, SOFT 0), source of truth apps/web/public/brand/era-mark.svg. Shown in both inks on both islands (ink #1C1B19 on cream, cream #FAF7F0 on ink — a mode choice, never a recolor), the clear-space rule visualized (≈0.1× the mark's width per side = 3× the period's diameter), and the min-size row (16px web inline floor). Never stretched, recolored, glowed, or shadowed."
        >
          <IslandPair content={(m) => <BrandMarkIsland mode={m} />} />
        </Section>

        <Section title="Type roles" note="The seven Fraunces/Geist variants at their default step.">
          <IslandPair content={() => <TypeIsland />} />
        </Section>

        <Section title="Spacing">
          <IslandPair
            content={() => (
              <div style={rowStyle}>
                {Object.entries(spacing).map(([key, value]) => (
                  <Swatch
                    key={key}
                    label={`${key} · ${value}`}
                    box={{ width: `var(--space-${key.slice(1)})`, height: `var(--space-${key.slice(1)})`, background: 'var(--color-accent)', borderRadius: 'var(--radius-chip)' }}
                  />
                ))}
              </div>
            )}
          />
        </Section>

        <Section title="Radii" note="Including `full` (9999) as a pill / orb.">
          <IslandPair
            content={() => (
              <div style={rowStyle}>
                {Object.entries(radii).map(([key, value]) => (
                  <Swatch
                    key={key}
                    label={`${key} · ${value}`}
                    box={{
                      width: 'var(--space-12)',
                      height: 'var(--space-12)',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-hairline)',
                      borderRadius: `var(--radius-${key})`,
                    }}
                  />
                ))}
              </div>
            )}
          />
        </Section>

        <Section title="Elevation" note="e1–e4. The dark column uses the DARK shadow recipes (e4 true black) via var(--shadow-e*).">
          <IslandPair content={() => <ElevationIsland />} />
        </Section>

        <Section title="Glass" note="The §3 recipe: blur(20) + mode tint + var(--glass-border) frame + var(--glass-highlight) top edge.">
          <IslandPair content={() => <GlassIsland />} />
        </Section>

        <Section title="Glow + pulse" note="Accent halo at the per-mode glow opacity, breathing on the idle loop.">
          <IslandPair content={(m) => <GlowIsland mode={m} />} />
        </Section>

        <Section
          title="Ovi orb"
          note="Ovi's living presence — a dimensional warm-cream sphere (radial core, 1px taupe rim, lit highlight arc) carrying the §3 glow. Three sizes (corner 44 / header 28 / panel 64) × three states: IDLE breathes on the 3s heartbeat, THINKING adds a slow rotating glow shimmer with a quicker breath, SPEAKING pulses a touch larger on the reply cadence. Interactive orbs (the corner FAB, the panel) also lean toward the pointer. Under reduced motion every orb holds static at base glow opacity — no breath, shimmer, pulse, or lean."
        >
          <IslandPair content={() => <OviOrbIsland />} />
        </Section>

        <Section
          title="Waiting moments"
          note="Every waiting and failure beat (D-WAIT). Loading is Ovi's orb breathing — inline (20px whisper, optional caption) or page (44px corner, centred) — never a spinner. Skeletons are warm-cream surface blocks (NEVER gray) with a slow 135° sheen sweep on the 1800ms loop; content replaces them with a 150ms fade, no pop. Toasts auto-dismiss on the 2500ms cadence: the error variant carries a muted-rust hairline (calm, no red banner, no exclamation), success blooms a small accent glow on entrance. The failed-load state is an editorial Fraunces line + one retry. Reduced motion: shimmer off, static orb, toasts fade without the bloom."
        >
          <IslandPair content={() => <WaitingMomentsIsland />} />
        </Section>

        <Section
          title="Ovi suggestion"
          note="The ambient strip (D-AMBIENT) — Ovi present beyond the panel. A quiet glass strip (e2, chip radius) carrying the 20px whisper orb (idle), ONE italic oviAccent line, ONE quiet action, and a dismiss ×. Max one per screen, dismissible (persists), never blocking. It fades-rises in ~800ms after content settles (fade only under reduced motion); tapping the line or action opens Ovi pre-seeded, the × keeps THIS suggestion quiet for good. Specimen keys are lab-only, so a lab dismiss never silences a real surface."
        >
          <IslandPair content={() => <OviSuggestionIsland />} />
        </Section>

        <Section
          title="Glass conversation"
          note="The D3.2 panel anatomy, live: the real §3 glass recipe (blur + tint + 1px border + top highlight, sheet radius) carrying the header orb + 'Ovi' accent + quiet close, a user bubble, then Ovi's editorial reply that word-streams on Replay at the stream.wordMs cadence with the accent caret blinking on caretDimOpacity — the orb holds SPEAKING for exactly the reveal, then settles. The three canonical chips + the glass input row with the pressing send are inert (chips toast-noop). Replay remounts via key; reduced motion shows the reply whole."
        >
          <IslandPair content={() => <GlassConversationIsland />} />
        </Section>

        <Section
          title="Header choreography"
          note="The real PageHeader (D6): on mount the title rises 8px on the gentle spring and the subtitle trails 60ms behind (motion.headerRise). Replay remounts it to re-run the rise. The two phi rhythm gaps — header-below 32 and section-above 52 — render below as labeled accent spacer bars, the way the Spacing section shows its tokens."
        >
          <IslandPair content={() => <HeaderChoreographyIsland />} />
        </Section>

        <Section title="Sheen" note="var(--sheen-gradient) laid over an accent surface.">
          <IslandPair content={() => <SheenIsland />} />
        </Section>

        <Section
          title="Item Engine"
          note="The D7 hero object (ItemSurface): 4:5 cutout card with hairline + dual shadow + 135° sheen + 1% warm tone. Rows = six categories; columns = forced states (rest / lift / tilt / selected), rendered statically. One live full-tilt specimen per island. Cutouts fall back to quiz stand-ins until real PNGs land in public/design-lab/cutouts/."
        >
          <IslandPair content={() => <ItemEngineIsland />} />
        </Section>

        <Section
          title="Editorial closet"
          note="The D8 closet's editorial grammar: the real Fraunces-Italic section label (oviAccent) with its hairline rule filling the row, a live density toggle reflowing the specimen grid between the two density values (lab-local, not persisted), and the cost-per-wear line in Fraunces numerals over its quiet 'per wear' label (the detail-sheet treatment). Real lab cutouts sit in ItemSurface tiles so the label / rule / density read against actual cards."
        >
          <IslandPair content={() => <EditorialClosetIsland />} />
        </Section>

        <Section
          title="Shop card"
          note="The Shop product card on the Item-Engine grammar: the product photo AS the hero object (ItemSurface — 4:5 cream card, hairline, dual-e3, sheen, 1% warm tone, hover lift), with brand / title / price / actions reading beneath it. The 'why' is Ovi's whisper for every kind — the 20px idle orb beside a Fraunces-Italic line: completes_outfits opens Ovi, fills_gap taps to the detail sheet, and the honest similar_owned warning keeps the whisper voice with a rust caution marker. One quiet voice, not a label taxonomy. Fixtures are lab-scoped; product images fall back to the brand initial."
        >
          <IslandPair content={() => <ShopCardIsland />} />
        </Section>

        <Section
          title="Canvas physics"
          note="The outfit-canvas drag physics, static: a 4:5 paper with the 1px var(--color-hairline) snap guides crossing it, and one piece parked on the guide carrying the e3 'item' shadow — the lift a piece holds while dragged. Live, the lift eases in on drag-start and settles out on release via the fluid spring (a hard set under reduced motion); the guides appear only while snapping."
        >
          <IslandPair content={() => <CanvasPhysicsIsland />} />
        </Section>

        <Section
          title="Reveal ritual"
          note="The D9 Today's Look reveal on the lab cutouts: cream canvas → the look assembles slot by slot (gentle springs, each shadow landing 120ms behind its piece, ≤2.5s, tap to skip) → settles into the composed card with Ovi's italic line. Replay runs it again — no once-per-day gate here. The card's actions hit the real endpoints; the lab pieces aren't in a closet, so Wear it declines honestly."
        >
          <IslandPair content={() => <RevealRitualIsland />} />
        </Section>

        <Section
          title="Style quiz"
          note="The REAL, replayable quiz → reveal flow (D-QUIZ), embedded as one live island. Full-bleed image choices with cream letterboxing and glass captions; a thin warm progress line (accent fill over hairline, no dots) between back and skip; selecting a tile springs the press and blooms the accent glow into the steady ring; questions in Fraunces (title). Completing it computes the profile client-side with the pure, API-free deterministicProfile and renders the real Reveal — the archetype name blooms first in Display Fraunces with its synced glow disc, the palette cascades on the 45ms beat, and the era card settles last (≤1800ms). The CTA is inert here; Replay remounts the flow at step one. Reduced motion collapses every beat to a plain fade."
        >
          <QuizLabIsland />
        </Section>

        <Section
          title="Public feed frame (flagged)"
          note="The FLAGGED public-feed direction (D-FEED Part B), shown WITHOUT flipping ERA_FEED_ENABLED — 'TikTok's hierarchy, Era's materials'. One re-skinned FeedCard on fixture data: a full-bleed portrait cover that contain-fits with a CREAM letterbox (never black), a right-edge vertical glass engagement rail (like / save / more as §3 busy-glass buttons with their counts beneath), and the creator as a Fraunces-italic name over a busy-glass scrim (AA over any imagery). The rail is inert here — every action is a no-op, so the specimen never writes. This is what ships when the flag turns on."
        >
          <IslandPair content={() => <PublicFeedFrameIsland />} />
        </Section>

        <Section title="Components" note="Button variants, Chip, Input, Card — in both islands.">
          <IslandPair content={() => <ComponentsIsland chips={chips} onToggleChip={toggleChip} />} />
        </Section>

        <Section title="Motion playground">
          <IslandPair content={() => <MotionPlayground />} />
        </Section>

        <Section title="Post-signup gift" note="The D-GIFT choreography: the orb blooms, 'You're in.' lands in Display Fraunces, then the referral card rises with the place-in-line numeral (fixture 214). The choreography IS the specimen — hit Replay to re-run it. Unreachable in the app without signing up.">
          <GiftSpecimen />
        </Section>

        <Section
          title="Email — BaseEmail"
          note="The @era/email BaseEmail layout via the base-sample template (React Email), rendered to HTML and shown in a sandboxed 600px iframe. Every value derives from the @era/tokens email tokens (asserted 1:1 in tokens.test.ts): warm-cream canvas, 48px (spacing.s12) padding, the hosted 'era.' wordmark PNG top center, hairline dividers, an editorial Georgia (Fraunces stand-in) h1, system-sans body, a muted-rust caution line, and the CAN-SPAM footer with an example unsubscribe link. The left frame is the email as an inbox renders it; the right FORCES the dark ruleset (the prefers-color-scheme media query rewritten to apply unconditionally) so BaseEmail's dark block recolors the classed elements — the way a scheme-aware client (Apple Mail) would. The wordmark stays a baked-cream-field PNG so a force-inverting client can't wreck the mark."
        >
          <EmailPreview />
        </Section>

        <Section title="Glass over busy imagery" note="A deterministic feTurbulence + gradient background (no assets) with TWO panels floating over it — default glass and the busy AA scrim. The dark busy panel is the visible proof the scrim keeps text legible over any backdrop.">
          <IslandPair content={() => <BusyImageryIsland />} />
        </Section>

        <Section title="WCAG contrast" note="Data-driven from runContrastAudit(), grouped by mode.">
          <ContrastReadout />
        </Section>

        <Section title="Overlays">
          <div style={rowStyle}>
            <Button variant="secondary" onClick={() => setSheetOpen((v) => !v)}>
              {sheetOpen ? 'Hide sheet' : 'Show glass sheet'}
            </Button>
          </div>
        </Section>
      </Container>

      {sheetOpen ? (
        <GlassSheet peek>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Text variant="title" as="h3" size="title3" style={{ margin: 0 }}>
              Glass sheet
            </Text>
            <Text variant="body" as="p" style={{ color: 'var(--color-secondary)' }}>
              Tap the grabber to expand to full height.
            </Text>
          </div>
        </GlassSheet>
      ) : null}

      <OviFab onClick={() => setSheetOpen((v) => !v)} />
      <TabBar active={activeTab} onChange={setActiveTab} />
    </main>
  );
}
