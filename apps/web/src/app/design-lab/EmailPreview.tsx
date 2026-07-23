'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { createElement } from 'react';
import {
  BaseSampleEmail,
  DeletionEmail,
  EraPlusReceiptEmail,
  LaunchInviteEmail,
  MagicLinkEmail,
  renderEmail,
  WaitlistEmail,
  WelcomeEmail,
} from '@era/email';
import { Text } from '../../components/Text';
import { themeVarStyle } from '../../lib/theme-css';

/**
 * Design-lab preview of `@era/email` — the base layout plus the full
 * transactional family. A small chip picker cycles the seven templates; each is
 * rendered to HTML on the client (design-lab is a dev-only route with no data
 * fetches, so a client render is fine) and shown in a sandboxed iframe at the
 * 600px email width — twice. The first island is the email as an inbox renders
 * it. The second FORCES the dark ruleset: the same HTML, but the iframe's own
 * `<html>` advertises `color-scheme: dark` and we inject a matching
 * `prefers-color-scheme: dark` context so BaseEmail's dark media block applies —
 * the way Apple Mail (scheme-aware) would recolor it. It's the visual proof the
 * `.email-*` classed elements swap to the dark palette.
 *
 * `sandbox` (no allow-scripts) keeps the email inert; `srcDoc` avoids any network
 * fetch for the frame document itself (the hosted wordmark PNG still loads).
 */
const FRAME_WIDTH = 600;
const FRAME_HEIGHT = 640;

/**
 * The seven previewable templates, keyed by name → a factory that builds the
 * element with realistic sample props. The picker cycles these; the record keeps
 * the mapping declarative so adding a template is one line.
 */
const TEMPLATES: Record<string, () => ReactElement> = {
  'base-sample': () => createElement(BaseSampleEmail),
  'magic-link': () => createElement(MagicLinkEmail, { url: 'https://era.style/sign-in/confirm?next=%2F' }),
  welcome: () => createElement(WelcomeEmail, { name: 'Guy', appUrl: 'https://era.style' }),
  waitlist: () => createElement(WaitlistEmail, { position: 214 }),
  'launch-invite': () => createElement(LaunchInviteEmail, { accessUrl: 'https://era.style' }),
  deletion: () => createElement(DeletionEmail),
  'era-plus-receipt': () => createElement(EraPlusReceiptEmail),
};

const TEMPLATE_KEYS = Object.keys(TEMPLATES);

/**
 * Force the email's dark ruleset on. `color-scheme` tricks can't do this —
 * `prefers-color-scheme` resolves against the OS/browser preference regardless
 * of the frame's declared scheme — so the deterministic simulation is rewriting
 * the media query itself to unconditionally apply.
 */
function forceDark(html: string): string {
  return html.replace('@media (prefers-color-scheme: dark)', '@media all');
}

const frameStyle: CSSProperties = {
  width: FRAME_WIDTH,
  maxWidth: '100%',
  height: FRAME_HEIGHT,
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
};

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  minWidth: 0,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-6)',
  alignItems: 'flex-start',
};

const pickerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  marginBottom: 'var(--space-4)',
};

const chipBase: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--color-hairline)',
  background: 'transparent',
  color: 'var(--color-secondary)',
  cursor: 'pointer',
  font: 'inherit',
};

const chipActive: CSSProperties = {
  ...chipBase,
  background: 'var(--color-ink)',
  color: 'var(--color-cream)',
  borderColor: 'var(--color-ink)',
};

// The forced-dark wrapper reads the DARK token recipe (themeVarStyle('dark'))
// scoped to this subtree — the same island trick the page uses — so its surround
// comes from @era/tokens, never a literal hex.
const darkWrapperStyle: CSSProperties = {
  ...columnStyle,
  ...themeVarStyle('dark'),
  padding: 'var(--space-3)',
  background: 'var(--color-bg)',
  borderRadius: 'var(--radius-card)',
};

export function EmailPreview() {
  const [selected, setSelected] = useState<string>(TEMPLATE_KEYS[0]!);
  const [html, setHtml] = useState<string | null>(null);

  const element = useMemo(() => TEMPLATES[selected]!(), [selected]);

  useEffect(() => {
    let active = true;
    setHtml(null);
    renderEmail(element).then(({ html: out }) => {
      if (active) {
        setHtml(out);
      }
    });
    return () => {
      active = false;
    };
  }, [element]);

  return (
    <div style={columnStyle}>
      <div style={pickerStyle}>
        {TEMPLATE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            style={key === selected ? chipActive : chipBase}
            aria-pressed={key === selected}
          >
            {key}
          </button>
        ))}
      </div>

      {html === null ? (
        <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)' }}>
          Rendering {selected}…
        </Text>
      ) : (
        <div style={rowStyle}>
          <div style={columnStyle}>
            <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              as-is (light)
            </Text>
            <iframe title={`${selected} email — light`} srcDoc={html} sandbox="" style={frameStyle} />
          </div>
          <div style={darkWrapperStyle}>
            <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              forced dark (client inversion)
            </Text>
            <iframe title={`${selected} email — forced dark`} srcDoc={forceDark(html)} sandbox="" style={frameStyle} />
          </div>
        </div>
      )}
    </div>
  );
}
