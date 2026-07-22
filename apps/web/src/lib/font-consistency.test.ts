import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * The two-font rule (enforced).
 *
 * Era ships exactly two faces: **Fraunces** (primary, editorial serif) and
 * **Geist** (the single secondary sans). No third font family may appear in a
 * font declaration anywhere in the app source — text routes through
 * `<Text variant>` (`@era/tokens` typeRoles), which is the only place a family
 * is set, from the token vars.
 *
 * There are exactly TWO documented exceptions, both genuine "a different font is
 * actually needed" cases:
 *   1. `apps/web/src/components/site/prose.ts` — `.era-prose code{}` monospace,
 *      for literal `<code>` in journal/legal prose (code is semantically code).
 *   2. the transactional email templates (`apps/web/src/lib/send-*.ts`) — a
 *      `-apple-system` SYSTEM stack, because email clients strip `@font-face`
 *      and cannot load Geist. That stack carries no bespoke third face.
 *
 * This test fails if any monospace or legacy-serif face is smuggled into a font
 * declaration outside those exceptions. Run from the `web` package (cwd =
 * apps/web), it scans both apps so consistency holds across web AND mobile.
 */

const REPO_ROOT = resolve(process.cwd(), '../..');

// Face names that would betray a smuggled third font (monospace / legacy serif).
// Generic system fallbacks in the email stack (Helvetica/Arial/-apple-system)
// are NOT bespoke faces and are intentionally not listed.
const BANNED_FACES = [
  'ui-monospace',
  'SFMono',
  'Menlo',
  'Consolas',
  'Courier',
  'Georgia',
  'Times New Roman',
  'Roboto Mono',
  'Fira',
] as const;

// Files permitted to carry a documented exception (relative to repo root).
const ALLOWED_EXCEPTIONS = new Set([
  'apps/web/src/components/site/prose.ts',
  // Exception #2 (see the doc block above): the waitlist email sets its heading
  // in a Georgia/'Times New Roman'/serif stack — the web-safe stand-in for
  // Fraunces, since email clients strip @font-face. Server-rendered HTML string
  // literal, not linted CSS; the only serif-stack email template.
  'apps/web/src/lib/send-waitlist-email.ts',
]);

const SCAN_ROOTS = ['apps/web/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'assets']);

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

test('two-font rule: only Fraunces + Geist — no third font family outside the documented exceptions', () => {
  const files = SCAN_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root)));
  const violations: string[] = [];

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (ALLOWED_EXCEPTIONS.has(rel)) {
      continue;
    }
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      // Only consider lines that actually declare a font family.
      if (!/font-?[fF]amily/.test(line)) {
        return;
      }
      const banned = BANNED_FACES.find((face) => line.includes(face));
      if (banned) {
        violations.push(`${rel}:${index + 1} → "${banned}"`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Third font family found — the app is Fraunces + Geist only (see font-consistency.test.ts):\n${violations.join('\n')}`,
  );
});
