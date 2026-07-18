'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  typeRamp,
  spacing,
  radii,
  boxShadows,
  sheen,
  glass,
  glow,
  motion as motionToken,
  runContrastAudit,
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
import { useTheme, type ThemeMode } from '../../lib/theme';
import { springTransition } from '../../lib/motion';

const TYPE_ROLES = [
  'caption',
  'footnote',
  'subhead',
  'body',
  'title3',
  'title2',
  'title1',
  'largeTitle',
  'display',
] as const;

const SPRING_NAMES = ['gentle', 'snappy', 'fluid'] as const;

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <Text variant="title" as="h2" size="title2" style={{ margin: 0 }}>
        {title}
      </Text>
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

function SpringDemo({ name }: { name: (typeof SPRING_NAMES)[number] }) {
  const [on, setOn] = useState(false);
  const reduced = useReducedMotion();
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
      }}
      aria-label={`Toggle ${name} spring`}
    >
      <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)' }}>
        {name}
      </Text>
      <div
        style={{
          width: 'var(--content-max)',
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
          transition={reduced ? { duration: motionToken.durations.reducedFadeMs / 1000 } : springTransition(motionToken.springs[name])}
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

type AuditRow = ReturnType<typeof runContrastAudit>[number];

function ContrastReadout() {
  const rows: readonly AuditRow[] = runContrastAudit();
  const passed = rows.filter((r: AuditRow) => r.pass).length;

  const cellStyle: CSSProperties = {
    padding: 'var(--space-2)',
    fontSize: typeRamp.footnote.rem,
    textAlign: 'left',
    borderBottom: '1px solid var(--color-hairline)',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Text variant="ui" as="strong" size="subhead">
        {passed}/{rows.length} pass
      </Text>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['', 'id', 'mode', 'fg', 'bg', 'usage', 'req', 'ratio', ''].map((h, i) => (
                <Text key={i} variant="caption" as="th" size="footnote" style={{ padding: 'var(--space-2)', textAlign: 'left', borderBottom: '1px solid var(--color-hairline)', whiteSpace: 'nowrap', color: 'var(--color-secondary)' }}>
                  {h}
                </Text>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: AuditRow) => (
              <tr key={`${row.id}-${row.mode}`}>
                <td style={cellStyle}>
                  <span style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                    <span style={{ width: 'var(--space-4)', height: 'var(--space-4)', borderRadius: 'var(--radius-chip)', background: row.fg, border: '1px solid var(--color-hairline)' }} />
                    <span style={{ width: 'var(--space-4)', height: 'var(--space-4)', borderRadius: 'var(--radius-chip)', background: row.bg, border: '1px solid var(--color-hairline)' }} />
                  </span>
                </td>
                <td style={cellStyle}>{row.id}</td>
                <td style={cellStyle}>{row.mode}</td>
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
  );
}

export default function DesignLabPage() {
  const { mode, resolved, setMode } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('design');
  const [chips, setChips] = useState<Record<string, boolean>>({ linen: true, wool: false, silk: false });

  const glowShadow = `${boxShadows.e3}, 0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${Math.round(
    glow.opacity[resolved] * 100,
  )}%, transparent)`;

  return (
    <main style={{ paddingBottom: 'calc(var(--tabbar-height) + var(--space-16))' }}>
      <Container>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBlock: 'var(--space-8)' }}>
          <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
            Era design lab
          </Text>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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

        <Section title="Buttons">
          <div style={rowStyle}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </Section>

        <Section title="Cards">
          <div style={rowStyle}>
            <div style={{ width: 'var(--feed-col)' }}>
              <Card>
                <div style={{ padding: 'var(--space-4)' }}>Resting card (e2)</div>
              </Card>
            </div>
            <div style={{ width: 'var(--feed-col)' }}>
              <Card interactive>
                <div style={{ padding: 'var(--space-4)' }}>Interactive — hover to lift (e3)</div>
              </Card>
            </div>
            <div style={{ width: 'var(--feed-col)' }}>
              <Card interactive aspect="item">
                <div style={{ color: 'var(--color-secondary)' }}>Item 4:5 + sheen</div>
              </Card>
            </div>
          </div>
        </Section>

        <Section title="Inputs">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 'var(--feed-col)' }}>
            <Input label="Email" placeholder="you@example.com" />
            <Input label="Username" defaultValue="!!" error="3–20 characters: letters, numbers, or underscores." />
          </div>
        </Section>

        <Section title="Chips">
          <div style={rowStyle}>
            {Object.keys(chips).map((key) => (
              <Chip
                key={key}
                selected={chips[key]}
                onClick={() => setChips((c) => ({ ...c, [key]: !c[key] }))}
              >
                {key}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Type ramp">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {TYPE_ROLES.map((role) => (
              <div key={role} style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline' }}>
                <Text variant="caption" as="span" style={{ width: 'var(--space-16)', color: 'var(--color-secondary)' }}>
                  {role} · {typeRamp[role].px}px
                </Text>
                <span style={{ fontSize: typeRamp[role].rem, lineHeight: `${typeRamp[role].lineHeight}px` }}>
                  The quick brown fox
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Spacing">
          <div style={rowStyle}>
            {Object.entries(spacing).map(([key, value]) => (
              <Swatch
                key={key}
                label={`${key} · ${value}`}
                box={{ width: `var(--space-${key.slice(1)})`, height: `var(--space-${key.slice(1)})`, background: 'var(--color-accent)', borderRadius: 'var(--radius-chip)' }}
              />
            ))}
          </div>
        </Section>

        <Section title="Radii">
          <div style={rowStyle}>
            {Object.entries(radii).map(([key, value]) => (
              <Swatch
                key={key}
                label={`${key} · ${value}`}
                box={{ width: 'var(--space-12)', height: 'var(--space-12)', background: 'var(--color-surface)', border: '1px solid var(--color-hairline)', borderRadius: `var(--radius-${key})` }}
              />
            ))}
          </div>
        </Section>

        <Section title="Elevation">
          <div style={rowStyle}>
            {(['e1', 'e2', 'e3', 'e4'] as const).map((level) => (
              <Swatch
                key={level}
                label={level}
                box={{ width: 'var(--space-16)', height: 'var(--space-12)', background: 'var(--color-surface)', borderRadius: 'var(--radius-card)', boxShadow: boxShadows[level] }}
              />
            ))}
          </div>
        </Section>

        <Section title="Glass · glow · sheen">
          <div style={rowStyle}>
            <div
              style={{
                width: 'var(--content-max)',
                maxWidth: 'var(--feed-col)',
                height: 'var(--space-16)',
                borderRadius: 'var(--radius-sheet)',
                background: `color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)`,
                backdropFilter: 'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border: 'var(--glass-border-width) solid var(--color-hairline)',
                boxShadow: `${boxShadows.e4}, inset 0 1px 0 0 ${glass.innerHighlightColor}`,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--color-secondary)',
              }}
            >
              glass
            </div>
            <div
              style={{
                width: 'var(--space-16)',
                height: 'var(--space-16)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-accent)',
                boxShadow: glowShadow,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--color-ink)',
              }}
            >
              glow
            </div>
            <div
              style={{
                position: 'relative',
                width: 'var(--space-16)',
                height: 'var(--space-16)',
                borderRadius: 'var(--radius-card)',
                overflow: 'hidden',
                background: 'var(--color-accent)',
              }}
            >
              <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(${sheen.angleDeg}deg, ${sheen.from}, ${sheen.to})` }} />
            </div>
          </div>
        </Section>

        <Section title="Springs">
          <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
            {SPRING_NAMES.map((name) => (
              <SpringDemo key={name} name={name} />
            ))}
          </div>
        </Section>

        <Section title="Overlays">
          <div style={rowStyle}>
            <Button variant="secondary" onClick={() => setSheetOpen((v) => !v)}>
              {sheetOpen ? 'Hide sheet' : 'Show glass sheet'}
            </Button>
          </div>
        </Section>

        <Section title="Contrast audit">
          <ContrastReadout />
        </Section>
      </Container>

      {sheetOpen ? (
        <GlassSheet peek>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Text variant="title" as="h3" size="title3" style={{ margin: 0 }}>Glass sheet</Text>
            <Text variant="body" as="p" style={{ color: 'var(--color-secondary)' }}>Tap the grabber to expand to full height.</Text>
          </div>
        </GlassSheet>
      ) : null}

      <OviFab onClick={() => setSheetOpen((v) => !v)} />
      <TabBar active={activeTab} onChange={setActiveTab} />
    </main>
  );
}
