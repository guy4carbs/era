import type { Metadata } from 'next';

import { PillarView } from '../../../components/site';
import { getPillar, pillarMetadata } from '../../../lib/pillars';

/**
 * `/ai-stylist` — the AI Stylist pillar page. A thin wrapper over the shared
 * {@link PillarView}; all copy lives in the typed content module
 * (`src/content/pillars/ai-stylist.ts`). Static content — no env, no DB.
 */
const content = getPillar('ai-stylist');

export const metadata: Metadata = pillarMetadata(content);

export default function AiStylistPage() {
  return <PillarView content={content} />;
}
