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
  },
  grid: {
    mobileColumns: 2,
    mobileMargin: 16,
    gutter: 12,
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
} as const;
