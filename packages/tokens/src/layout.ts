/**
 * layout — structural constants: touch targets, bars, grid, and breakpoints.
 *
 * Proportions lean on the golden ratio (phi = 1.618): the hero splits 61.8 /
 * 38.2, and bottom sheets peek at 38.2% before expanding full. The feed is a
 * single centered column, not a fluid grid, once past the `lg` breakpoint.
 */

export const layout = {
  touchTarget: {
    ios: 44, // Apple HIG minimum
    webMin: 44,
    webPreferred: 48,
  },
  tabBarHeight: 49,
  headerHeight: 44,
  itemCard: {
    aspectRatio: '4 / 5', // CSS value
    ratio: 0.8, // 4 / 5, for numeric contexts (RN)
    padding: 12,
    // lift — the HERO interaction (D7 Item Engine): hover/press raises the
    // card toward the viewer (−4px, ×1.02) with the shadow deepening a step.
    // Deliberate divergence from motion.press.scale (0.97): every other
    // tappable compresses; the item card is the product — it rises.
    lift: {
      yPx: -4,
      scale: 1.02,
    },
    // warmToneOpacity — a 1% accent-hued wash over the cutout so mixed-source
    // photos harmonize on the cream surface. Imperceptible alone; the grid
    // reads as one collection instead of many cameras.
    warmToneOpacity: 0.01,
  },
  grid: {
    mobileColumns: 2,
    mobileMargin: 16,
    gutter: 12,
    // gutterTall — the editorial vertical gutter (D8 closet gallery): rows
    // breathe at ~phi × the horizontal gutter (12 × 1.618 ≈ 19.4 → 20 on the
    // 4pt grid), so the spread reads like a magazine page, not a spreadsheet.
    gutterTall: 20,
    desktopColumnsMin: 4,
    desktopColumnsMax: 6,
  },
  contentMaxWidth: 1200,
  phi: 1.618,
  // heroSplit — golden-ratio two-pane hero (primary 61.8% / secondary 38.2%).
  heroSplit: {
    primary: 61.8,
    secondary: 38.2,
  },
  // sheets peek at 38.2% of height (1 - 1/phi), then expand to full.
  sheetPeekFraction: 0.382,
  // feed — a single centered column of this width at >= lg (1024px).
  feedColumnWidth: 480,
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
  // hover — pointer-device affordance (web); lift up 2px and intensify glow.
  hover: {
    liftPx: -2,
    glowIntensity: 0.6,
  },
  // rail — the desktop web left rail (D5 nav): a slim 232px column sitting
  // directly on the app background (no glass, no borders — quiet luxury).
  // glowDotPx is the active/hover indicator dot; orbPx is Ovi's small
  // decorative orb beside the wordmark (one-quarter of the 48px FAB).
  rail: {
    width: 232,
    glowDotPx: 6,
    orbPx: 12,
  },
  // rhythm — the page's vertical breathing (D6): the space above a section is
  // ~phi times the space below the page header (52 / 32 = 1.625 ≈ 1.618),
  // both snapped to the 4pt grid. Header sits 32px above its first section;
  // each subsequent section opens 52px of air above itself.
  rhythm: {
    headerBelowPx: 32,
    sectionAbovePx: 52,
  },
  // oviPanel — the conversation's floating glass home (D3.2). On web/desktop a
  // 420px panel anchored bottom-right above the corner orb, capped at 72vh —
  // chat NEVER consumes the whole page. On mobile the panel becomes a 3/4-height
  // glass sheet (deliberately taller than the generic GlassSheet's peek × phi
  // expansion — a conversation needs room; still never full-screen).
  oviPanel: {
    widthPx: 420,
    maxHeightVh: 72,
    sheetFraction: 0.75,
  },
} as const;
