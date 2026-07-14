import type { Metadata } from 'next';

import { PillarView } from '../../../components/site';
import { getPillar, pillarMetadata } from '../../../lib/pillars';

/**
 * `/virtual-wardrobe` — the Virtual Wardrobe pillar page. A thin wrapper over the
 * shared {@link PillarView}; all copy lives in the typed content module
 * (`src/content/pillars/virtual-wardrobe.ts`). Static content — no env, no DB.
 */
const content = getPillar('virtual-wardrobe');

export const metadata: Metadata = pillarMetadata(content);

export default function VirtualWardrobePage() {
  return <PillarView content={content} />;
}
