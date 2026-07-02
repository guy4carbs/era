import { strings } from '@era/core/strings';

import { TabScreen } from '@/components/TabScreen';

// Route files require a default export — expo-router discovers screens this way.
export default function DesignScreen() {
  return <TabScreen title="Design" empty={strings.outfits.emptyDesign} />;
}
