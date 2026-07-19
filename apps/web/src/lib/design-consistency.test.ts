import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * The design-token rule (enforced) — sibling of font-consistency.test.ts.
 *
 * Every design value ships from `@era/tokens`: colors as `palette` / the
 * `--color-*` vars, shadows as `boxShadows`/`rnShadow`/`var(--shadow-e*)`,
 * radii as `radii.*` / `var(--radius-*)`. App source must not hardcode a hex
 * colour, a literal shadow recipe, or a numeric corner radius.
 *
 * Documented exceptions (each a genuine "literal is needed" case):
 *   1. Email templates (`apps/web/src/lib/send-*.ts`) — server-rendered HTML
 *      strings; email clients see no CSS vars, so the palette is inlined.
 *   2. The web design lab (`app/design-lab/page.tsx`) — its busy-imagery SVG
 *      art uses deliberately NON-token vivid colours: the point of that panel
 *      is verifying the glass recipe over arbitrary imagery.
 *   3. `app.json` / config files — JSON cannot import tokens (not scanned:
 *      only .ts/.tsx/.css are).
 *
 * A new legitimate exception must be added to the allowlist here WITH a reason,
 * so every literal design value stays deliberate and auditable.
 */

const REPO_ROOT = resolve(process.cwd(), '../..');

const SCAN_ROOTS = ['apps/web/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'assets']);

/** Files allowed to carry literals, with the reason documented above. */
const ALLOWED_FILES: readonly RegExp[] = [
  /^apps\/web\/src\/lib\/send-[a-z-]+\.ts$/, // email HTML — no CSS vars in mail clients
  /^apps\/web\/src\/app\/design-lab\/page\.tsx$/, // busy-imagery SVG art — deliberately non-token
  /^apps\/mobile\/app\/design-lab\.tsx$/, // ditto, mobile lab busy imagery
  /^apps\/web\/src\/components\/ovi\/reveal-export\.ts$/, // canvas 2D fills — ctx can't read CSS vars, palette drawn as literal hex (same as email)
];

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const SHADOW_LINE_RE = /box-?[sS]hadow/;
const SHADOW_LITERAL_RE = /rgba?\(|#[0-9a-fA-F]{3}/;
// A literal radius is a violation UNLESS it is bare zero — "no rounding" is
// the absence of a design value, not a hardcoded one (e.g. the glass rail).
const RADIUS_LITERAL_RE = /border-?[rR]adius['"]?:\s*['"`]?\d/;
const RADIUS_ZERO_RE = /border-?[rR]adius['"]?:\s*['"`]?0(?![.\d])/;

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

/** True for pure comment lines — prose may legitimately mention a hex value. */
function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

test('design tokens: no hardcoded hex / shadow / radius outside packages/tokens', () => {
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
      if (HEX_RE.test(line)) {
        violations.push(`${rel}:${index + 1} hex → ${line.trim().slice(0, 90)}`);
      }
      if (SHADOW_LINE_RE.test(line) && SHADOW_LITERAL_RE.test(line)) {
        violations.push(`${rel}:${index + 1} shadow-literal → ${line.trim().slice(0, 90)}`);
      }
      if (RADIUS_LITERAL_RE.test(line) && !RADIUS_ZERO_RE.test(line)) {
        violations.push(`${rel}:${index + 1} radius-literal → ${line.trim().slice(0, 90)}`);
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Hardcoded design values found — everything ships from @era/tokens (see design-consistency.test.ts):\n${violations.join('\n')}`,
  );
});
