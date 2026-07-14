/**
 * Zero-orphan guarantees for the Layer-2 internal-link graph. These are the
 * invariants that keep every journal / pillar / style page findable by crawlers
 * and users — asserted so a future edit to the graph or the sitemap can't quietly
 * strand a page.
 *
 * Runs under the web app's node test runner:
 *   node --experimental-strip-types --test src/lib/seo-graph.test.ts
 * It imports only plain `.ts` (the graph, the sitemap-entries helper, which read
 * post meta from `journal.ts` — never the `.mdx` bodies), so nothing here forces
 * an MDX parse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEO_GRAPH, FOOTER_LINKS, type SeoPath } from './seo-graph.ts';
import { layer2SitemapEntries } from './seo-sitemap-entries.ts';
import { siteUrl } from './site-url.ts';

const NODES = Object.values(SEO_GRAPH);
const PATHS = new Set<string>(Object.keys(SEO_GRAPH));

test('declares exactly the 16 Layer-2 nodes', () => {
  assert.equal(NODES.length, 16);
});

test('every outbound edge points at a node that exists', () => {
  for (const node of NODES) {
    for (const target of node.outbound) {
      assert.ok(PATHS.has(target), `${node.path} → ${target} points at a missing node`);
    }
  }
});

test('no node links to itself', () => {
  for (const node of NODES) {
    assert.ok(
      !(node.outbound as readonly string[]).includes(node.path),
      `${node.path} links to itself`,
    );
  }
});

test('every node is reachable from / via the footer Explore row', () => {
  // BFS from the root, seeded by the footer edges (the site's only entry into
  // Layer 2 from the front door).
  const seen = new Set<string>(FOOTER_LINKS);
  const queue: string[] = [...FOOTER_LINKS];
  while (queue.length > 0) {
    const path = queue.shift()!;
    for (const target of SEO_GRAPH[path as SeoPath].outbound) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  for (const path of PATHS) {
    assert.ok(seen.has(path), `${path} is orphaned — not reachable from /`);
  }
});

test('every node has at least one outbound edge', () => {
  for (const node of NODES) {
    assert.ok(node.outbound.length > 0, `${node.path} has no outbound edges`);
  }
});

test('every node has at least one inbound edge (footer counts as inbound)', () => {
  // Inbound sources are every node's outbound list plus the footer's root edges —
  // the top-level hubs (e.g. /journal) are reached only via the footer, which is
  // a real inbound link the footer component renders.
  const inbound = new Set<string>();
  for (const path of FOOTER_LINKS) inbound.add(path);
  for (const node of NODES) {
    for (const target of node.outbound) inbound.add(target);
  }
  for (const path of PATHS) {
    assert.ok(inbound.has(path), `${path} has no inbound edges`);
  }
});

test('every node appears in the Layer-2 sitemap entries', () => {
  const entryUrls = new Set(layer2SitemapEntries().map((entry) => entry.url));
  for (const path of PATHS) {
    assert.ok(
      entryUrls.has(`${siteUrl()}${path}`),
      `${path} is missing from the sitemap Layer-2 entries`,
    );
  }
});

test('the sitemap Layer-2 list is exactly the 16 graph nodes', () => {
  const entries = layer2SitemapEntries();
  assert.equal(entries.length, 16);
  const expected = new Set([...PATHS].map((path) => `${siteUrl()}${path}`));
  for (const entry of entries) {
    assert.ok(expected.has(entry.url), `sitemap entry ${entry.url} is not a graph node`);
  }
});
