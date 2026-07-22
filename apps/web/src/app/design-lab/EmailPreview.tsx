'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createElement } from 'react';
import { BaseSampleEmail, renderEmail } from '@era/email';
import { Text } from '../../components/Text';
import { themeVarStyle } from '../../lib/theme-css';

/**
 * Design-lab preview of `@era/email`'s BaseEmail, via the base-sample template.
 *
 * The email is rendered to HTML on the client (design-lab is a dev-only route
 * with no data fetches, so a client render is fine) and shown in a sandboxed
 * iframe at the 600px email width — twice. The first island is the email as an
 * inbox renders it. The second FORCES the dark ruleset: the same HTML, but the
 * iframe's own `<html>` advertises `color-scheme: dark` and we inject a matching
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
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    renderEmail(createElement(BaseSampleEmail)).then(({ html: out }) => {
      if (active) {
        setHtml(out);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (html === null) {
    return (
      <Text variant="body" as="p" size="footnote" style={{ margin: 0, color: 'var(--color-secondary)' }}>
        Rendering base-sample…
      </Text>
    );
  }

  return (
    <div style={rowStyle}>
      <div style={columnStyle}>
        <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          as-is (light)
        </Text>
        <iframe title="base-sample email — light" srcDoc={html} sandbox="" style={frameStyle} />
      </div>
      <div style={darkWrapperStyle}>
        <Text variant="caption" as="span" size="footnote" style={{ color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          forced dark (client inversion)
        </Text>
        <iframe title="base-sample email — forced dark" srcDoc={forceDark(html)} sandbox="" style={frameStyle} />
      </div>
    </div>
  );
}
