/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires static require() literals for bundled assets */
// Static require() map for the 30 style-quiz images.
// Metro bundler needs string-literal require paths, so every entry is spelled out.
// Keys match the quiz option keys; identical JPGs live at apps/web/public/quiz/<key>.jpg.

export const quizImages = {
  s1_minimal: require('../assets/quiz/s1_minimal.jpg'),
  s1_expressive: require('../assets/quiz/s1_expressive.jpg'),
  s3_fitted: require('../assets/quiz/s3_fitted.jpg'),
  s3_relaxed: require('../assets/quiz/s3_relaxed.jpg'),
  s4_structured: require('../assets/quiz/s4_structured.jpg'),
  s4_soft: require('../assets/quiz/s4_soft.jpg'),
  s5_solids: require('../assets/quiz/s5_solids.jpg'),
  s5_subtle: require('../assets/quiz/s5_subtle.jpg'),
  s5_bold: require('../assets/quiz/s5_bold.jpg'),
  s6_sneakers: require('../assets/quiz/s6_sneakers.jpg'),
  s6_boots: require('../assets/quiz/s6_boots.jpg'),
  s6_loafers: require('../assets/quiz/s6_loafers.jpg'),
  s7_bare: require('../assets/quiz/s7_bare.jpg'),
  s7_signature: require('../assets/quiz/s7_signature.jpg'),
  s7_stacked: require('../assets/quiz/s7_stacked.jpg'),
  s8_work: require('../assets/quiz/s8_work.jpg'),
  s8_casual: require('../assets/quiz/s8_casual.jpg'),
  s8_nights: require('../assets/quiz/s8_nights.jpg'),
  s8_active: require('../assets/quiz/s8_active.jpg'),
  s8_events: require('../assets/quiz/s8_events.jpg'),
  s9_quiet_luxe: require('../assets/quiz/s9_quiet_luxe.jpg'),
  s9_minimalist: require('../assets/quiz/s9_minimalist.jpg'),
  s9_streetwear: require('../assets/quiz/s9_streetwear.jpg'),
  s9_romantic: require('../assets/quiz/s9_romantic.jpg'),
  s9_edgy: require('../assets/quiz/s9_edgy.jpg'),
  s9_eclectic: require('../assets/quiz/s9_eclectic.jpg'),
  s10_blazer: require('../assets/quiz/s10_blazer.jpg'),
  s10_bomber: require('../assets/quiz/s10_bomber.jpg'),
  s10_longcoat: require('../assets/quiz/s10_longcoat.jpg'),
  s10_technical: require('../assets/quiz/s10_technical.jpg'),
} as const;
