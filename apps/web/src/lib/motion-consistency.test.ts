import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * The motion rule (enforced) — sibling of font/design-consistency tests.
 *
 * Nothing in the app animates with linear or default easing. Every animation
 * runs a token spring (gentle/snappy/fluid via `transitionFor`/`animate`), the
 * brand bezier (`motion.easing` — cubic-bezier(0.32, 0.72, 0, 1) / reanimated
 * `tokenEasing`), or a sanctioned reduced-motion fade. Forbidden forms:
 *
 *   - Framer/motion string easings: ease: 'linear' | 'easeIn' | 'easeOut' |
 *     'easeInOut' (use `motionToken.easing.bezier` or a spring).
 *   - Reanimated default-easing families: Easing.linear / Easing.ease /
 *     Easing.inOut / Easing.in / Easing.out / Easing.quad / Easing.cubic
 *     (use `tokenEasing` from lib/motion).
 *   - CSS transition/animation shorthand with linear/ease keywords
 *     (`linear-gradient` is a paint, not an easing — excluded).
 *   - Literal press scales in whileTap (use `motion.press.scale`).
 *
 * A new legitimate exception must be allowlisted here WITH a reason.
 */

const REPO_ROOT = resolve(process.cwd(), '../..');

const SCAN_ROOTS = ['apps/web/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'assets']);

/** Files allowed to carry exceptions (none expected today). */
const ALLOWED_FILES: readonly RegExp[] = [];

const RULES: readonly { name: string; re: RegExp; exclude?: RegExp }[] = [
  {
    name: 'string-easing',
    re: /ease:\s*['"](linear|easeIn|easeOut|easeInOut)['"]/,
  },
  {
    name: 'reanimated-default-easing',
    re: /Easing\.(linear|ease\b|inOut|in\b|out\b|quad|cubic\b)/,
  },
  {
    name: 'css-keyword-easing',
    // transition/animation declarations using keyword easings; linear-gradient excluded.
    re: /(transition|animation)[^;'"`\n]*\b(linear|ease-in-out|ease-in|ease-out)\b/,
    exclude: /linear-gradient/,
  },
  {
    name: 'literal-press-scale',
    re: /whileTap[^\n]*scale:\s*0\.9\d?\b(?![\d])/,
    exclude: /press\.scale/,
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

test('motion: no linear/default easing, no literal press scales — springs and the token bezier only', () => {
  const files = SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root)));
  const violations: string[] = [];

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (ALLOWED_FILES.some((re) => re.test(rel))) {
      continue;
    }
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (isComment(line)) {
        return;
      }
      for (const rule of RULES) {
        if (rule.re.test(line) && !(rule.exclude && rule.exclude.test(line))) {
          violations.push(`${rel}:${index + 1} [${rule.name}] → ${line.trim().slice(0, 90)}`);
        }
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Non-token motion found — springs + the brand bezier only (see motion-consistency.test.ts):\n${violations.join('\n')}`,
  );
});
