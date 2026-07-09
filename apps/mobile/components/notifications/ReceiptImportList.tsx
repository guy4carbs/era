/**
 * ReceiptImportList — the feed surface for unread receipt-import cards.
 *
 * Sibling to {@link PriceDropList}: hydrates once from `GET /api/notifications`
 * (which degrades to `[]` on error), keeps only unread `receipt_import` rows, and
 * renders a {@link ReceiptImportCard} for each. Renders nothing when there's
 * nothing to show, so it stays a quiet member of the feed.
 *
 * This is the single place the card's side effects live: a tap fires a selection
 * haptic, marks the row read, and routes to the closet tab where the drafts wait.
 * The tap removes the card locally so it doesn't reappear this session.
 *
 * A plain mapped column (not a FlatList) because it mounts inside the feed's
 * ScrollView — nesting a virtualized list there would fight the outer scroll.
 */
import { spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ReceiptImportCard } from './ReceiptImportCard';
import {
  isReceiptImport,
  listNotifications,
  markRead,
  type InAppNotification,
  type ReceiptImportPayload,
} from './api';

export function ReceiptImportList() {
  const router = useRouter();
  const [items, setItems] = useState<readonly InAppNotification<ReceiptImportPayload>[]>([]);

  useEffect(() => {
    let active = true;
    void listNotifications().then((all) => {
      if (!active) return;
      setItems(all.filter(isReceiptImport).filter((n) => n.readAt === null));
    });
    return () => {
      active = false;
    };
  }, []);

  function onOpen(notification: InAppNotification<ReceiptImportPayload>) {
    void Haptics.selectionAsync();
    markRead(notification.id);
    setItems((prev) => prev.filter((n) => n.id !== notification.id));
    router.push('/(tabs)/closet');
  }

  // Quiet by construction: no cards, no surface.
  if (items.length === 0) return null;

  return (
    <View style={styles.list}>
      {items.map((notification) => (
        <ReceiptImportCard key={notification.id} notification={notification} onOpen={onOpen} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s4,
  },
});
