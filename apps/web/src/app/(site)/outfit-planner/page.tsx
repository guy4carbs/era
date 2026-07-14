import type { Metadata } from 'next';

import { PillarView } from '../../../components/site';
import { getPillar, pillarMetadata } from '../../../lib/pillars';

/**
 * `/outfit-planner` — the Outfit Planner pillar page. A thin wrapper over the
 * shared {@link PillarView}; all copy lives in the typed content module
 * (`src/content/pillars/outfit-planner.ts`). Static content — no env, no DB.
 */
const content = getPillar('outfit-planner');

export const metadata: Metadata = pillarMetadata(content);

export default function OutfitPlannerPage() {
  return <PillarView content={content} />;
}
