/**
 * OrdersSettings — the newest-first order history on the Settings surface. Reads
 * the caller's orders on mount (degrading to an empty list on any error) and
 * renders one row per order: the retailer + title, the total, and a humanized
 * status. A failed order offers the honest tap-out — "Finish at {retailer}" opens
 * that store's affiliate link — since an in-flow order that didn't go through falls
 * back to the retailer's own site. Only mounted by the Settings screen when the
 * cosmetic checkout flag is on.
 */
import { layout, radii, spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import { getOrders, type OrderRecord } from '@/components/checkout/api';
import { checkoutCopy, formatCents } from '@/components/checkout/copy';

const copy = strings.shop.checkout;

type LoadState = 'loading' | 'ready';

export function OrdersSettings() {
  const { colors } = useTheme();
  const [orders, setOrders] = useState<readonly OrderRecord[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    void getOrders().then((next) => {
      if (!active) return;
      setOrders(next);
      setState('ready');
    });
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return <ActivityIndicator color={colors.text} style={styles.loading} />;
  }

  if (orders.length === 0) {
    return (
      <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
        {copy.ordersEmpty}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {orders.map((order) => (
        <OrderRow key={order.orderId} order={order} />
      ))}
    </View>
  );
}

function OrderRow({ order }: { readonly order: OrderRecord }) {
  const { colors } = useTheme();
  const failed = order.status === 'failed';
  const total = order.totalCents !== null ? formatCents(order.totalCents, order.currency) : null;

  const openHandoff = () => {
    if (!isHttpsUrl(order.affiliateUrl)) return;
    void Linking.openURL(order.affiliateUrl).catch(() => {
      // No browser handler is vanishingly rare; nothing to recover.
    });
  };

  return (
    <View style={[styles.row, { borderColor: colors.hairline }]}>
      <View style={styles.rowMain}>
        <Text
          numberOfLines={1}
          variant="caption"
          size="footnote"
          weight={600}
          color={colors.secondaryStrong}
          style={styles.brand}
        >
          {order.retailer.toUpperCase()}
        </Text>
        <Text numberOfLines={2} variant="body" color={colors.text}>
          {order.title}
        </Text>
        <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
          {copy.orderStatus(order.status)}
          {total ? `  ·  ${total}` : ''}
        </Text>
        {failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={checkoutCopy.finishAt(order.retailer)}
            onPress={openHandoff}
            style={styles.handoff}
          >
            <Text variant="ui" size="footnote" weight={600} color={colors.accent}>
              {checkoutCopy.finishAt(order.retailer)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** True only for a well-formed https URL — guards the native open against a hostile scheme. */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s3,
  },
  brand: {
    letterSpacing: 0.4,
  },
  loading: {
    paddingVertical: spacing.s4,
    alignSelf: 'flex-start',
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    padding: spacing.s4,
  },
  rowMain: {
    gap: spacing.s1,
  },
  handoff: {
    minHeight: layout.touchTarget.ios,
    justifyContent: 'center',
  },
});
