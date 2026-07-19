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
  OviFab,
  TabBar,
  type TabId,
} from '../../components';
import { Text } from '../../components/Text';
import { glassSurfaceStyle } from '../../components/GlassPanel';
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

        <Section title="Sheen" note="var(--sheen-gradient) laid over an accent surface.">
          <IslandPair content={() => <SheenIsland />} />
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
