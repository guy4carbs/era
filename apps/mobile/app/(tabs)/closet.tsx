import { strings } from '@era/core/strings';

import { TabScreen } from '@/components/TabScreen';

// Route files require a default export — expo-router discovers screens this way.
export default function ClosetScreen() {
  return <TabScreen title="Closet" empty={strings.closet.empty} />;
}
