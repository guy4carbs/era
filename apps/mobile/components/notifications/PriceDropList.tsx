/**
 * PriceDropList — the feed surface for unread price-drop cards.
 *
 * Hydrates once from `GET /api/notifications` (which degrades to `[]` on error),
 * keeps only unread `price_drop` rows, and renders a {@link PriceDropCard} for
 * each. Renders nothing when there's nothing to show, so it stays a quiet member
 * of the feed — like Ovi's Today card, it's invisible until it has something.
 *
 * This is the single place the card's side effects live: "Take a look" clicks out
 * to the affiliate link (https-guarded, with a selection haptic) and marks the
 * row read; "Dismiss" just marks it read. Both remove the card locally so it
 * doesn't reappear on this session.
 *
 * A plain mapped column (not a FlatList) because it mounts inside the feed's
 * ScrollView — nesting a virtualized list there would fight the outer scroll.
 */
import { spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PriceDropCard } from './PriceDropCard';
import {
  isPriceDrop,
  listNotifications,
  markRead,
  type InAppNotification,
  type PriceDropPayload,
} from './api';

export function PriceDropList() {
  const [items, setItems] = useState<readonly InAppNotification<PriceDropPayload>[]>([]);

  useEffect(() => {
    let active = true;
    void listNotifications().then((all) => {
      if (!active) return;
      setItems(all.filter(isPriceDrop).filter((n) => n.readAt === null));
    });
    return () => {
      active = false;
    };
  }, []);

  function clear(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  function onView(notification: InAppNotification<PriceDropPayload>) {
    // Defense-in-depth: only open a well-formed https link (a hostile payload
    // could otherwise hand back a tel:/custom-scheme link to open natively).
    if (isHttpsUrl(notification.payload.affiliateUrl)) {
      void Haptics.selectionAsync();
      void Linking.openURL(notification.payload.affiliateUrl).catch(() => {
        // A device with no browser handler is vanishingly rare; nothing to recover.
      });
    }
    markRead(notification.id);
    clear(notification.id);
  }

  function onDismiss(notification: InAppNotification<PriceDropPayload>) {
    markRead(notification.id);
    clear(notification.id);
  }

  // Quiet by construction: no cards, no surface.
  if (items.length === 0) return null;

  return (
    <View style={styles.list}>
      {items.map((notification) => (
        <PriceDropCard
          key={notification.id}
          notification={notification}
          onView={onView}
          onDismiss={onDismiss}
        />
      ))}
    </View>
  );
}

/**
 * True only for a well-formed `https:` URL. Guards the native open against a
 * hostile payload handing back a non-https link (mirrors the Shop tab's guard).
 */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s4,
  },
});
