/**
 * The Layer-2 internal-link graph — the zero-orphan machine.
 *
 * Every Layer-2 page is declared here as a node with a human, descriptive
 * `title` (which doubles as the anchor text everywhere it is linked — never
 * "click here") and an `outbound` edge list. Route components import this to
 * render their "Related"/"Explore" blocks, so the on-page link structure and the
 * declared graph can never drift: there is one source of truth for who links to
 * whom.
 *
 * The design guarantees (asserted in `seo-graph.test.ts`): every node is
 * reachable from `/` via the footer's Explore row, every node has at least one
 * inbound and one outbound edge, no edge points at a missing node, and every
 * node appears in the sitemap's Layer-2 list.
 *
 * Edge design intent:
 *   - Each pillar ↔ its one cluster post (both directions).
 *   - Each pillar → /styles + the 2–3 archetypes that fit its theme.
 *   - Each archetype → /styles + 2 siblings (cyclic in canonical order) + 1 pillar.
 *   - /journal → all 3 posts + all 3 pillars.  /styles → all 8 archetypes + a pillar.
 *   - Each post → its 2 sibling posts + its pillar.
 */

/** One page in the graph: its path, its anchor text, and where it links out to. */
export interface SeoNode {
  readonly path: string;
  readonly title: string;
  readonly outbound: readonly string[];
}

/**
 * The 16 Layer-2 nodes, keyed by path. `title` is the descriptive anchor text
 * used wherever the page is linked to.
 */
export const SEO_GRAPH = {
  '/journal': {
    path: '/journal',
    title: 'Journal',
    outbound: [
      '/journal/how-to-digitize-your-closet',
      '/journal/what-an-ai-stylist-actually-does',
      '/journal/plan-a-week-of-outfits',
      '/virtual-wardrobe',
      '/ai-stylist',
      '/outfit-planner',
    ],
  },
  '/journal/how-to-digitize-your-closet': {
    path: '/journal/how-to-digitize-your-closet',
    title: 'How to Digitize Your Closet',
    outbound: [
      '/journal/what-an-ai-stylist-actually-does',
      '/journal/plan-a-week-of-outfits',
      '/virtual-wardrobe',
    ],
  },
  '/journal/what-an-ai-stylist-actually-does': {
    path: '/journal/what-an-ai-stylist-actually-does',
    title: 'What an AI Stylist Actually Does',
    outbound: [
      '/journal/how-to-digitize-your-closet',
      '/journal/plan-a-week-of-outfits',
      '/ai-stylist',
    ],
  },
  '/journal/plan-a-week-of-outfits': {
    path: '/journal/plan-a-week-of-outfits',
    title: 'How to Plan a Week of Outfits',
    outbound: [
      '/journal/how-to-digitize-your-closet',
      '/journal/what-an-ai-stylist-actually-does',
      '/outfit-planner',
    ],
  },
  '/virtual-wardrobe': {
    path: '/virtual-wardrobe',
    title: 'Virtual Wardrobe',
    outbound: [
      '/journal/how-to-digitize-your-closet',
      '/styles',
      '/styles/minimalist',
      '/styles/classic',
      '/styles/quiet-luxe',
    ],
  },
  '/ai-stylist': {
    path: '/ai-stylist',
    title: 'AI Stylist',
    outbound: [
      '/journal/what-an-ai-stylist-actually-does',
      '/styles',
      '/styles/streetwear',
      '/styles/eclectic',
      '/styles/athleisure',
    ],
  },
  '/outfit-planner': {
    path: '/outfit-planner',
    title: 'Outfit Planner',
    outbound: [
      '/journal/plan-a-week-of-outfits',
      '/styles',
      '/styles/romantic',
      '/styles/edgy',
      '/styles/classic',
    ],
  },
  '/styles': {
    path: '/styles',
    title: 'Style Guide',
    outbound: [
      '/styles/quiet-luxe',
      '/styles/minimalist',
      '/styles/classic',
      '/styles/streetwear',
      '/styles/romantic',
      '/styles/edgy',
      '/styles/eclectic',
      '/styles/athleisure',
      '/virtual-wardrobe',
    ],
  },
  '/styles/quiet-luxe': {
    path: '/styles/quiet-luxe',
    title: 'Quiet Luxe',
    outbound: ['/styles', '/styles/minimalist', '/styles/classic', '/virtual-wardrobe'],
  },
  '/styles/minimalist': {
    path: '/styles/minimalist',
    title: 'Minimalist',
    outbound: ['/styles', '/styles/classic', '/styles/streetwear', '/virtual-wardrobe'],
  },
  '/styles/classic': {
    path: '/styles/classic',
    title: 'Classic',
    outbound: ['/styles', '/styles/streetwear', '/styles/romantic', '/virtual-wardrobe'],
  },
  '/styles/streetwear': {
    path: '/styles/streetwear',
    title: 'Streetwear',
    outbound: ['/styles', '/styles/romantic', '/styles/edgy', '/ai-stylist'],
  },
  '/styles/romantic': {
    path: '/styles/romantic',
    title: 'Romantic',
    outbound: ['/styles', '/styles/edgy', '/styles/eclectic', '/outfit-planner'],
  },
  '/styles/edgy': {
    path: '/styles/edgy',
    title: 'Edgy',
    outbound: ['/styles', '/styles/eclectic', '/styles/athleisure', '/outfit-planner'],
  },
  '/styles/eclectic': {
    path: '/styles/eclectic',
    title: 'Eclectic',
    outbound: ['/styles', '/styles/athleisure', '/styles/quiet-luxe', '/ai-stylist'],
  },
  '/styles/athleisure': {
    path: '/styles/athleisure',
    title: 'Athleisure',
    outbound: ['/styles', '/styles/quiet-luxe', '/styles/minimalist', '/ai-stylist'],
  },
} as const satisfies Record<string, SeoNode>;

/** A known Layer-2 node path. */
export type SeoPath = keyof typeof SEO_GRAPH;

/**
 * The footer's "Explore" row — the edges from the site root `/` into Layer 2.
 * These are what make every node reachable from the front door, and the footer
 * component renders exactly this list. Kept here so the graph is the single
 * source of truth for root reachability (the test seeds from it).
 */
export const FOOTER_LINKS = [
  '/journal',
  '/styles',
  '/virtual-wardrobe',
  '/ai-stylist',
  '/outfit-planner',
] as const satisfies readonly SeoPath[];

/** A link target: a path plus its descriptive anchor text. */
export interface SeoLink {
  readonly path: string;
  readonly title: string;
}

/** Resolve a path to its `{ path, title }` link (title = descriptive anchor text). */
export function seoLink(path: SeoPath): SeoLink {
  const node = SEO_GRAPH[path];
  return { path: node.path, title: node.title };
}

/**
 * The outbound links for a page, resolved to `{ path, title }` for rendering.
 * Components pass their own path and render the result as a descriptive-anchor
 * link list — the on-page structure that realizes the declared graph.
 */
export function outboundLinks(path: SeoPath): SeoLink[] {
  return SEO_GRAPH[path].outbound.map((target) => seoLink(target as SeoPath));
}
