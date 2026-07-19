/**
 * WearStatsBlock — the item-detail wear panel: count, cost-per-wear, and a tap.
 *
 * Fetches the piece's authoritative `{ wearCount, purchasePrice }` from
 * `/api/wear-logs/stats` on mount (seeded meanwhile by the count the list route
 * already handed us, so the block never flashes empty). It renders the natural
 * wear count, a cost-per-wear read from `@era/core/wear-stats` (an honest dash /
 * gentle invite when the price is unknown), and REUSES {@link WoreItButton} to log
 * this piece as worn today. On a confirmed log the count bumps optimistically and
 * re-fetches, so cost-per-wear visibly drops without waiting on the round-trip.
 *
 * Colour, type, and spacing come from tokens only; copy from `strings.wear`.
 */
import { costPerWear } from '@era/core/wear-stats';
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { WoreItButton } from '@/components/ovi';
import { useTheme } from '@/lib/theme';

import { fetchItemWearStats } from './api';
import { formatMoney } from './format';

interface WearStatsBlockProps {
  readonly itemId: string;
  /** The item's currency, for the cost-per-wear line (stats carries no currency). */
  readonly currency: string | null;
  /** The wear count the list route already resolved — the pre-fetch seed. */
  readonly seedWearCount: number;
  /** The item's purchase price seed (refined by the stats fetch). */
  readonly seedPrice: string | null;
  /** Surface a toast to the parent (which owns the on-screen Toast). */
  readonly onToast: (message: string) => void;
}

export function WearStatsBlock({ itemId, currency, seedWearCount, seedPrice, onToast }: WearStatsBlockProps) {
  const { colors } = useTheme();
  const [wearCount, setWearCount] = useState(seedWearCount);
  const [price, setPrice] = useState<string | null>(seedPrice);

  // Pull the owner-scoped truth; a failure quietly keeps the seed (no error UI —
  // the count is a soft stat, not a blocking read).
  const load = useCallback(async () => {
    try {
      const stats = await fetchItemWearStats(itemId);
      setWearCount(stats.wearCount);
      setPrice(stats.purchasePrice);
    } catch {
      // Keep the seeded values; the tap still works.
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Optimistic on a confirmed log: bump now so cost-per-wear drops instantly,
  // then reconcile against the server.
  const onLogged = useCallback(() => {
    setWearCount((count) => count + 1);
    void load();
  }, [load]);

  // A usable price is one costPerWear accepts (positive, parseable); probe with a
  // wear count of 1 so the check is about the price alone. This matches web's
  // ItemWearStats: any non-usable price (null, empty, OR garbage like 'abc')
  // shows the gentle invite, never a blank — Gauge usability gate.
  const priceUsable = costPerWear(price, 1) !== null;
  const cpw = costPerWear(price, wearCount);

  return (
    <View style={styles.container}>
      <Text variant="ui" color={colors.text}>
        {strings.wear.count(wearCount)}
      </Text>

      {/* Editorial cost-per-wear: when we have a real number, the amount reads in
          Fraunces numerals (serif `title`, clearing the 20px floor) with the
          quiet "per wear" caption beneath — a magazine stat, not a data row. A
          known-but-unpriced piece keeps the gentle invite; a null value (no
          usable price) renders NOTHING. */}
      {priceUsable ? (
        cpw !== null ? (
          <View style={styles.cost}>
            <Text variant="title" color={colors.text}>
              {formatMoney(cpw, currency)}
            </Text>
            <Text variant="caption" size="subhead" color={colors.secondaryStrong}>
              {strings.closet.costPerWearLabel}
            </Text>
          </View>
        ) : null
      ) : (
        <Text variant="caption" size="subhead" color={colors.secondaryStrong}>
          {strings.wear.costPerWearUnknown}
        </Text>
      )}

      <WoreItButton itemIds={[itemId]} via="item_detail" onToast={onToast} onLogged={onLogged} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s2,
  },
  // Amount over its label as a tight stat block, so the serif numerals lead and
  // "per wear" sits quietly beneath.
  cost: {
    gap: spacing.s1,
  },
});
