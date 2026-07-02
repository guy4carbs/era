import { strings } from '@era/core/strings';

import { TabScreen } from '@/components/TabScreen';

// Route files require a default export — expo-router discovers screens this way.
export default function ShopScreen() {
  return <TabScreen title="Shop" empty={strings.shop.empty} />;
}
