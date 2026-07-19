import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The Today reveal (D9) guards — three feature-scoped rules, siblings of the
 * global design/motion/font consistency tests, pinned to the reveal surface so a
 * regression in the signature ritual is caught precisely.
 *
 *   1. MOTION — every timing/spring in RevealStage derives from `motion.reveal`
 *      (or a token spring via `transitionFor`). No literal interval/lag/settle
 *      numbers, no string easings, no literal press/animation scales.
 *   2. DESIGN — the canvas export draws only palette-token-derived colours: it
 *      imports `palette` from `@era/tokens` and every hex it fills is a value
 *      that exists in the palette. No stray, off-token hex.
 *   3. FONT — the export resolves its faces from `fontFamilies` (Fraunces/Geist
 *      via the CSS vars + token fallbacks). No bespoke third face literal.
 */

const REPO_ROOT = resolve(process.cwd(), '../..');
const OVI_DIR = join(REPO_ROOT, 'apps/web/src/components/ovi');
const STAGE = join(OVI_DIR, 'RevealStage.tsx');
const EXPORT = join(OVI_DIR, 'reveal-export.ts');

function read(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n');
}

function isComment(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

test('reveal motion: RevealStage timings come from motion.reveal, no literal easings/scales', () => {
  const lines = read(STAGE);
  const violations: string[] = [];

  // The frozen reveal magic numbers — none may appear as a literal in the stage
  // (they must be read off `motionToken.reveal.*` / `motionToken.durations.*`).
  const FROZEN = [350, 120, 400, 2500];

  lines.forEach((line, index) => {
    if (isComment(line)) return;
    // String easings — springs + the token bezier only.
    if (/ease:\s*['"](linear|easeIn|easeOut|easeInOut)['"]/.test(line)) {
      violations.push(`${index + 1} [string-easing] → ${line.trim().slice(0, 80)}`);
    }
    // Literal press/whileTap scales — must route through motion.press.scale.
    if (/whileTap[^\n]*scale:\s*0\.9\d?\b/.test(line) && !/press\.scale/.test(line)) {
      violations.push(`${index + 1} [literal-press-scale] → ${line.trim().slice(0, 80)}`);
    }
    // The frozen timing numbers must not be inlined.
    for (const n of FROZEN) {
      // Word-boundary match so we don't catch e.g. a 350 inside 3500 or a color.
      const re = new RegExp(`\\b${n}\\b`);
      if (re.test(line)) {
        violations.push(`${index + 1} [literal-reveal-timing:${n}] → ${line.trim().slice(0, 80)}`);
      }
    }
  });

  // Positive assertion: the stage actually reads the reveal tokens — whether
  // fully-qualified (`motionToken.reveal.settleMs`) or destructured off
  // `motionToken.reveal` (the interval helper). Each frozen field must be
  // sourced from the token, never inlined.
  const src = lines.join('\n');
  assert.ok(
    /=\s*motionToken\.reveal\b/.test(src) ||
      /motionToken\.reveal\.itemIntervalMs/.test(src),
    'RevealStage must read itemIntervalMs from motionToken.reveal',
  );
  // The shadow-lag cue was removed by user decree (2026-07-19: no shadows under
  // the reveal pieces — the bare garments are the composition). The token stays
  // in motion.reveal for a possible future return; the stage must NOT paint any
  // shadow shape, so we assert the ground-shadow code stays gone.
  assert.ok(
    !/groundShadow/i.test(src),
    'RevealStage must not reintroduce a painted ground shadow (user-rejected)',
  );
  assert.ok(
    /motionToken\.reveal\.settleMs/.test(src) || /\bsettleMs\b/.test(src),
    'RevealStage must read settleMs from motionToken.reveal',
  );
  assert.ok(
    /transitionFor\(/.test(src),
    'RevealStage must run its springs through transitionFor (reduced-motion aware)',
  );

  assert.deepEqual(
    violations,
    [],
    `RevealStage motion must derive from motion.reveal tokens:\n${violations.join('\n')}`,
  );
});

test('reveal design: the canvas export draws only palette-derived colours', () => {
  const lines = read(EXPORT);
  const src = lines.join('\n');

  // It must import the palette (the sanctioned literal-colour source for canvas).
  assert.ok(
    /import\s*\{[^}]*\bpalette\b[^}]*\}\s*from\s*'@era\/tokens'/.test(src),
    'reveal-export must import { palette } from @era/tokens',
  );

  // Collect every palette hex (both modes + top-level ink/white) so we can prove
  // any literal hex in the module is one of them (drawn as `CREAM.*` normally,
  // but this catches a stray inlined hex slipping past the CREAM.* indirection).
  const paletteHexes = new Set<string>();
  const colorsSrc = readFileSync(join(REPO_ROOT, 'packages/tokens/src/colors.ts'), 'utf8');
  for (const m of colorsSrc.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    paletteHexes.add(m[0].toLowerCase());
  }

  const violations: string[] = [];
  lines.forEach((line, index) => {
    if (isComment(line)) return;
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (!paletteHexes.has(m[0].toLowerCase())) {
        violations.push(`${index + 1} off-token hex → ${m[0]}`);
      }
    }
  });

  // The fills must reference the palette import, not raw strings.
  assert.ok(/CREAM\s*=\s*palette\.light/.test(src), 'reveal-export must derive CREAM from palette.light');

  assert.deepEqual(
    violations,
    [],
    `reveal-export drew a non-palette hex (canvas colours must come from @era/tokens palette):\n${violations.join('\n')}`,
  );
});

test('reveal font: the canvas export resolves faces from fontFamilies, no third face', () => {
  const lines = read(EXPORT);
  const src = lines.join('\n');

  assert.ok(
    /import\s*\{[^}]*\bfontFamilies\b[^}]*\}\s*from\s*'@era\/tokens'/.test(src),
    'reveal-export must import { fontFamilies } from @era/tokens',
  );
  assert.ok(
    /fontFamilies\.cssVar\.serif/.test(src) && /fontFamilies\.serifFallback/.test(src),
    'reveal-export must resolve the serif face from fontFamilies (var + fallback)',
  );
  assert.ok(
    /fontFamilies\.cssVar\.sans/.test(src) && /fontFamilies\.sansFallback/.test(src),
    'reveal-export must resolve the sans face from fontFamilies (var + fallback)',
  );

  // No bespoke third face smuggled into a canvas font string.
  const BANNED = ['ui-monospace', 'SFMono', 'Menlo', 'Consolas', 'Courier', 'Georgia', 'Times New Roman', 'Roboto Mono', 'Fira'];
  const violations: string[] = [];
  lines.forEach((line, index) => {
    if (isComment(line)) return;
    // Only lines building a canvas font string or a family literal matter.
    if (!/font\s*=|Family|font-?family/i.test(line)) return;
    const hit = BANNED.find((face) => line.includes(face));
    if (hit) violations.push(`${index + 1} → "${hit}"`);
  });

  assert.deepEqual(
    violations,
    [],
    `reveal-export used a third font face — Fraunces + Geist only:\n${violations.join('\n')}`,
  );
});
