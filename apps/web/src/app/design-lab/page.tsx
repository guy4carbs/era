'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
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
  GlassSheet,
  Input,
  ItemSurface,
  OviFab,
  TabBar,
  type ItemSurfaceForcedState,
  type TabId,
} from '../../components';
import { Text } from '../../components/Text';
import { glassSurfaceStyle } from '../../components/GlassPanel';
import { RevealStage, OviOrb, OviSuggestion, type OviOrbState } from '../../components/ovi';
import { strings } from '@era/core/strings';
import type { ProposedOutfit, OviSuggestion as OviSuggestionData } from '@era/core/ovi';
import { useTheme, type ThemeMode } from '../../lib/theme';
import { themeVarStyle } from '../../lib/theme-css';
import { springTransition } from '../../lib/motion';

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
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {Object.keys(chips).map((key) => (
          <Chip key={key} selected={chips[key]} onClick={() => onToggleChip(key)}>
            {key}
          </Chip>
        ))}
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
          title="Ovi suggestion"
          note="The ambient strip (D-AMBIENT) — Ovi present beyond the panel. A quiet glass strip (e2, chip radius) carrying the 20px whisper orb (idle), ONE italic oviAccent line, ONE quiet action, and a dismiss ×. Max one per screen, dismissible (persists), never blocking. It fades-rises in ~800ms after content settles (fade only under reduced motion); tapping the line or action opens Ovi pre-seeded, the × keeps THIS suggestion quiet for good. Specimen keys are lab-only, so a lab dismiss never silences a real surface."
        >
          <IslandPair content={() => <OviSuggestionIsland />} />
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
          title="Reveal ritual"
          note="The D9 Today's Look reveal on the lab cutouts: cream canvas → the look assembles slot by slot (gentle springs, each shadow landing 120ms behind its piece, ≤2.5s, tap to skip) → settles into the composed card with Ovi's italic line. Replay runs it again — no once-per-day gate here. The card's actions hit the real endpoints; the lab pieces aren't in a closet, so Wear it declines honestly."
        >
          <IslandPair content={() => <RevealRitualIsland />} />
        </Section>

        <Section title="Components" note="Button variants, Chip, Input, Card — in both islands.">
          <IslandPair content={() => <ComponentsIsland chips={chips} onToggleChip={toggleChip} />} />
        </Section>

        <Section title="Motion playground">
          <IslandPair content={() => <MotionPlayground />} />
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
