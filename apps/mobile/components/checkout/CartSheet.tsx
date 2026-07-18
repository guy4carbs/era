/**
 * CartSheet — the cross-store cart and single-checkout surface, in a GlassSheet.
 *
 * The user's "one checkout" across multiple retailers, honestly rendered: pieces
 * grouped by store (each with its own snapshot subtotal and the load-bearing
 * separate-shipments disclosure), a per-item size chip prefilled from saved sizes,
 * a shipping-address summary or inline capture, then a four-beat flow — start →
 * poll the real per-store offers → review the combined price BEFORE confirming →
 * confirm → poll to per-store outcomes. Non-supported ("handoff") pieces sit in
 * their own quiet section and tap out to the retailer's affiliate link, never a
 * fabricated in-flow success. A failed store falls back to its handoff link; a
 * failed checkout keeps the cart intact.
 *
 * ALL async is gated on `alive()` (the sheet is open AND still mounted): the batch
 * poll can run for minutes, and it must never advance a stage or touch state after
 * the sheet closes. The server re-gates every call — with checkout off, all of
 * these 404 — so this UI only renders when the cosmetic flag is on and the parent
 * mounts it. The parent owns the badge: mutations report the fresh cart count back.
 */
import { groupCartByRetailer, sizeKindForCategory } from '@era/core/checkout';
import { strings } from '@era/core/strings';
import { layout, radii, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { GlassSheet } from '@/components/GlassSheet';
import { prefillSizeForCategory, type UserSizes } from '@/lib/checkout-logic';
import { useTheme } from '@/lib/theme';

import { SizeChoiceRow } from './SizeChoiceRow';
import { ShippingAddressForm } from './ShippingAddressForm';
import { checkoutCopy, formatCents } from './copy';
import {
  confirmBatch,
  getCart,
  getShippingAddress,
  getSizes,
  hasShippingAddress,
  pollBatch,
  putShippingAddress,
  putSizes,
  removeFromCart,
  startCheckout,
  type BatchOrder,
  type CartItem,
  type CheckoutBatch,
  type ShippingAddress,
} from './api';

const copy = strings.shop.checkout;

/** The checkout flow's four beats plus the resting cart view. */
type Stage = 'cart' | 'starting' | 'review' | 'confirming' | 'done';

const EMPTY_SIZES: UserSizes = { apparelSize: null, denimSize: null, shoeSize: null };

interface CartSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Report the fresh cart count so the Shop-tab badge stays in step. */
  readonly onCartCountChange: (count: number) => void;
}

export function CartSheet({ open, onClose, onCartCountChange }: CartSheetProps) {
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<readonly CartItem[]>([]);
  const [sizes, setSizes] = useState<UserSizes>(EMPTY_SIZES);
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingSizeFor, setEditingSizeFor] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>('cart');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<CheckoutBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // `alive()` gates every async settle: true only while the sheet is open AND the
  // component is mounted. The batch poll checks it between reads so it can't advance
  // a stage after the sheet closes.
  const mountedRef = useRef(true);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const alive = useCallback(() => mountedRef.current && openRef.current, []);

  const reportCount = useCallback(
    (next: readonly CartItem[]) => {
      onCartCountChange(next.reduce((sum, item) => sum + Math.max(0, item.quantity), 0));
    },
    [onCartCountChange],
  );

  // Load the cart, saved sizes, and address each time the sheet opens; reset the
  // flow to the resting cart view. Nothing settles once the sheet has closed.
  useEffect(() => {
    if (!open) return;
    setStage('cart');
    setBatchId(null);
    setBatch(null);
    setNotice(null);
    setAddressFormOpen(false);
    setEditingSizeFor(null);
    setLoading(true);
    void (async () => {
      const [cart, savedSizes, addressState] = await Promise.all([
        getCart(),
        getSizes(),
        getShippingAddress().catch(() => ({ address: null }) as const),
      ]);
      if (!alive()) return;
      setItems(cart);
      setSizes(savedSizes);
      setAddress(hasShippingAddress(addressState) ? addressState : null);
      setLoading(false);
      reportCount(cart);
    })();
  }, [open, alive, reportCount]);

  const inFlow = items.filter((item) => item.support === 'in_flow');
  const handoff = items.filter((item) => item.support === 'handoff');
  const groups = groupCartByRetailer(inFlow);

  // --- mutations -------------------------------------------------------------

  const onRemove = useCallback(
    (cartItemId: string) => {
      const prev = items;
      const next = items.filter((item) => item.cartItemId !== cartItemId);
      setItems(next);
      reportCount(next);
      void removeFromCart(cartItemId).catch(() => {
        setItems(prev);
        reportCount(prev);
      });
    },
    [items, reportCount],
  );

  // The size chip edits the saved size for the item's dimension (first-set writes
  // back), optimistically. Every item of that kind shares the one saved size.
  const onSelectSize = useCallback(
    (patch: Partial<UserSizes>) => {
      const prev = sizes;
      const next = { ...sizes, ...patch };
      setSizes(next);
      setEditingSizeFor(null);
      void Haptics.selectionAsync();
      void putSizes(next).catch(() => {
        setSizes(prev);
        setNotice(strings.errors.generic);
      });
    },
    [sizes],
  );

  const onSaveAddress = useCallback(async (next: ShippingAddress) => {
    setBusy(true);
    try {
      const saved = await putShippingAddress(next);
      if (!alive()) return;
      setAddress(saved);
      setAddressFormOpen(false);
    } catch {
      if (alive()) setNotice(strings.errors.generic);
    } finally {
      if (alive()) setBusy(false);
    }
  }, [alive]);

  // --- the checkout flow -----------------------------------------------------

  const onCheckout = useCallback(async () => {
    if (busy) return;
    setNotice(null);
    setBusy(true);
    setStage('starting');
    try {
      const start = await startCheckout();
      setBatchId(start.batchId);
      const settled = await pollBatch(start.batchId, 'offer', alive);
      if (!alive()) return;
      setBatch(settled);
      setStage('review');
    } catch (error) {
      if (!alive()) return;
      handleCheckoutError(error, {
        onNoAddress: () => {
          setStage('cart');
          setAddressFormOpen(true);
        },
        onEmptyCart: () => {
          setStage('cart');
          void refreshCart();
        },
        onCalm: (message) => {
          setStage('cart');
          setNotice(message);
        },
      });
    } finally {
      if (alive()) setBusy(false);
    }
  }, [busy, alive]);

  const onConfirm = useCallback(async () => {
    if (busy || !batch || !batchId) return;
    setNotice(null);
    setBusy(true);
    setStage('confirming');
    try {
      await confirmBatch(batchId);
      const settled = await pollBatch(batchId, 'confirm', alive);
      if (!alive()) return;
      setBatch(settled);
      setStage('done');
      void refreshCart();
    } catch (error) {
      if (!alive()) return;
      handleCheckoutError(error, {
        // The order state moved on (e.g. a sibling failed at offer time): re-read the
        // batch and show honest per-store outcomes rather than a dead end.
        onInvalidState: async () => {
          try {
            const current = await pollBatch(batchId, 'confirm', alive);
            if (alive()) {
              setBatch(current);
              setStage('done');
            }
          } catch {
            if (alive()) {
              setStage('review');
              setNotice(copy.checkoutError);
            }
          }
        },
        onCalm: (message) => {
          setStage('review');
          setNotice(message);
        },
      });
    } finally {
      if (alive()) setBusy(false);
    }
  }, [busy, batch, batchId, alive]);

  const refreshCart = useCallback(async () => {
    const cart = await getCart();
    if (!alive()) return;
    setItems(cart);
    reportCount(cart);
  }, [alive, reportCount]);

  // --- render ----------------------------------------------------------------

  return (
    <GlassSheet open={open} onClose={busy ? () => {} : onClose}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text
          variant="ui"
          size="title3"
          weight={600}
          color={colors.text}
          accessibilityRole="header"
        >
          {stage === 'review'
            ? copy.reviewTitle
            : stage === 'done'
              ? copy.orderConfirmedTitle
              : copy.cartTitle}
        </Text>

        {/* The load-bearing honesty line — shown wherever the cart/confirm appears. */}
        <Text variant="caption" size="footnote" color={colors.secondary}>
          {copy.separateShipments}
        </Text>

        {notice ? (
          <Text variant="body" color={colors.secondaryStrong}>
            {notice}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.text} style={styles.block} />
        ) : stage === 'starting' ? (
          <StartingView groups={groups} />
        ) : stage === 'review' ? (
          <ReviewView batch={batch} onConfirm={() => void onConfirm()} busy={busy} />
        ) : stage === 'confirming' ? (
          <ConfirmingView batch={batch} groups={groups} />
        ) : stage === 'done' ? (
          <DoneView batch={batch} onClose={onClose} />
        ) : (
          <CartView
            groups={groups}
            itemsByRetailer={inFlow}
            handoff={handoff}
            sizes={sizes}
            address={address}
            addressFormOpen={addressFormOpen}
            editingSizeFor={editingSizeFor}
            busy={busy}
            onRemove={onRemove}
            onEditSize={setEditingSizeFor}
            onSelectSize={onSelectSize}
            onOpenAddressForm={() => setAddressFormOpen(true)}
            onSaveAddress={(next) => void onSaveAddress(next)}
            onCancelAddress={() => setAddressFormOpen(false)}
            onCheckout={() => void onCheckout()}
          />
        )}
      </ScrollView>
    </GlassSheet>
  );
}

// -----------------------------------------------------------------------------
// Cart view — grouped items, sizes, address, and the Check-out CTA.
// -----------------------------------------------------------------------------

interface CartViewProps {
  readonly groups: ReturnType<typeof groupCartByRetailer>;
  readonly itemsByRetailer: readonly CartItem[];
  readonly handoff: readonly CartItem[];
  readonly sizes: UserSizes;
  readonly address: ShippingAddress | null;
  readonly addressFormOpen: boolean;
  readonly editingSizeFor: string | null;
  readonly busy: boolean;
  readonly onRemove: (cartItemId: string) => void;
  readonly onEditSize: (cartItemId: string | null) => void;
  readonly onSelectSize: (patch: Partial<UserSizes>) => void;
  readonly onOpenAddressForm: () => void;
  readonly onSaveAddress: (address: ShippingAddress) => void;
  readonly onCancelAddress: () => void;
  readonly onCheckout: () => void;
}

function CartView({
  groups,
  itemsByRetailer,
  handoff,
  sizes,
  address,
  addressFormOpen,
  editingSizeFor,
  busy,
  onRemove,
  onEditSize,
  onSelectSize,
  onOpenAddressForm,
  onSaveAddress,
  onCancelAddress,
  onCheckout,
}: CartViewProps) {
  const { colors } = useTheme();
  const empty = groups.length === 0 && handoff.length === 0;

  if (empty) {
    return (
      <Text
        variant="body"
        color={colors.secondaryStrong}
        style={{ paddingVertical: spacing.s6 }}
      >
        {copy.cartEmpty}
      </Text>
    );
  }

  const canCheckout = groups.length > 0 && address !== null && !busy;

  return (
    <View style={styles.block}>
      {groups.map((group) => {
        const groupItems = itemsByRetailer.filter(
          (item) => normalize(item.retailer) === normalize(group.retailer),
        );
        return (
          <View key={group.retailer} style={styles.group}>
            <Text
              variant="caption"
              size="footnote"
              weight={600}
              color={colors.secondaryStrong}
              style={{ textTransform: 'uppercase' }}
            >
              {copy.retailerSection(group.retailer)}
            </Text>
            {groupItems.map((item) => (
              <CartLine
                key={item.cartItemId}
                item={item}
                sizes={sizes}
                editing={editingSizeFor === item.cartItemId}
                onRemove={() => onRemove(item.cartItemId)}
                onEditSize={() => onEditSize(editingSizeFor === item.cartItemId ? null : item.cartItemId)}
                onSelectSize={onSelectSize}
              />
            ))}
            <Text variant="caption" size="footnote" color={colors.text}>
              {copy.retailerSubtotal(formatCents(group.subtotalCents, group.currency))}
            </Text>
          </View>
        );
      })}

      {/* Handoff pieces — never in-flow; they tap out to the retailer's own site. */}
      {handoff.length > 0 ? (
        <View style={styles.group}>
          <Text
            variant="caption"
            size="footnote"
            weight={600}
            color={colors.secondaryStrong}
            style={{ textTransform: 'uppercase' }}
          >
            {checkoutCopy.handoffSectionTitle}
          </Text>
          {handoff.map((item) => (
            <HandoffLine key={item.cartItemId} item={item} onRemove={() => onRemove(item.cartItemId)} />
          ))}
        </View>
      ) : null}

      {/* Shipping address — summary + edit, or inline capture on first checkout. */}
      <View style={styles.group}>
        {addressFormOpen ? (
          <ShippingAddressForm
            initial={address}
            busy={busy}
            onSubmit={onSaveAddress}
            onCancel={onCancelAddress}
          />
        ) : address ? (
          <>
            <Text
              variant="caption"
              size="footnote"
              weight={600}
              color={colors.secondaryStrong}
              style={{ textTransform: 'uppercase' }}
            >
              {copy.shippingTo}
            </Text>
            <Text variant="body" color={colors.text}>
              {summarizeAddress(address)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={checkoutCopy.editAddress}
              onPress={onOpenAddressForm}
              style={styles.linkRow}
            >
              <Text variant="ui" size="footnote" weight={600} color={colors.accent}>
                {checkoutCopy.editAddress}
              </Text>
            </Pressable>
          </>
        ) : (
          <Button label={copy.addAddress} variant="secondary" onPress={onOpenAddressForm} />
        )}
      </View>

      {groups.length > 0 ? (
        <Button label={copy.buyInEra} onPress={onCheckout} disabled={!canCheckout} />
      ) : null}
    </View>
  );
}

/** One in-flow cart line — thumbnail, title/price, size chip, remove. */
function CartLine({
  item,
  sizes,
  editing,
  onRemove,
  onEditSize,
  onSelectSize,
}: {
  readonly item: CartItem;
  readonly sizes: UserSizes;
  readonly editing: boolean;
  readonly onRemove: () => void;
  readonly onEditSize: () => void;
  readonly onSelectSize: (patch: Partial<UserSizes>) => void;
}) {
  const { colors } = useTheme();
  const kind = item.category ? sizeKindForCategory(item.category) : 'one_size';
  const sized = kind !== 'one_size';
  const currentSize = item.category ? prefillSizeForCategory(item.category, sizes) : null;

  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Image
          source={{ uri: item.imageUrl }}
          style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
          resizeMode="cover"
          accessible={false}
        />
        <View style={styles.lineInfo}>
          <Text variant="body" color={colors.text} numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="ui" size="subhead" weight={600} color={colors.text}>
            {formatCents(item.priceSnapshotCents * Math.max(1, item.quantity), item.currency)}
          </Text>
          {sized ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={currentSize ? `${copy.sizeLabel} ${currentSize}` : copy.addSize}
              onPress={onEditSize}
              style={styles.sizeChip}
            >
              <Text variant="caption" size="footnote" color={colors.text}>
                {currentSize ? `${copy.sizeLabel}: ${currentSize}` : copy.addSize}
              </Text>
              <Text variant="caption" size="footnote" color={colors.secondary}>
                {`  ${checkoutCopy.changeSize}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.removeItem}
          hitSlop={spacing.s2}
          onPress={onRemove}
          style={styles.removeBtn}
        >
          <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong}>
            {copy.removeItem}
          </Text>
        </Pressable>
      </View>

      {sized && editing ? (
        <View style={styles.sizePicker}>
          <SizeChoiceRow
            kind={kind}
            selected={currentSize}
            onSelect={(size) => onSelectSize(patchForKind(kind, size))}
          />
        </View>
      ) : null}
    </View>
  );
}

/** One handoff cart line — a quiet row that taps out to the retailer's affiliate link. */
function HandoffLine({ item, onRemove }: { readonly item: CartItem; readonly onRemove: () => void }) {
  const { colors } = useTheme();
  const open = () => {
    if (!isHttpsUrl(item.affiliateUrl)) return;
    void Haptics.selectionAsync();
    void Linking.openURL(item.affiliateUrl).catch(() => {});
  };
  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Image
          source={{ uri: item.imageUrl }}
          style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
          resizeMode="cover"
          accessible={false}
        />
        <View style={styles.lineInfo}>
          <Text variant="body" color={colors.text} numberOfLines={2}>
            {item.title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={checkoutCopy.finishAt(item.retailer)}
            onPress={open}
            style={styles.linkRow}
          >
            <Text variant="ui" size="footnote" weight={600} color={colors.accent}>
              {checkoutCopy.finishAt(item.retailer)}
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.removeItem}
          hitSlop={spacing.s2}
          onPress={onRemove}
          style={styles.removeBtn}
        >
          <Text variant="ui" size="footnote" weight={600} color={colors.secondaryStrong}>
            {copy.removeItem}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Flow views — starting, review, confirming, done.
// -----------------------------------------------------------------------------

/** Patient per-store "getting the real price" lines while offers resolve. */
function StartingView({ groups }: { readonly groups: ReturnType<typeof groupCartByRetailer> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <ActivityIndicator color={colors.text} />
      {groups.map((group) => (
        <Text
          key={group.retailer}
          variant="body"
          color={colors.secondaryStrong}
          style={{ textAlign: 'center' }}
        >
          {copy.retrievingOffer(group.retailer)}
        </Text>
      ))}
    </View>
  );
}

/** The combined per-store + grand total, shown BEFORE the buyer confirms. */
function ReviewView({
  batch,
  onConfirm,
  busy,
}: {
  readonly batch: CheckoutBatch | null;
  readonly onConfirm: () => void;
  readonly busy: boolean;
}) {
  const { colors } = useTheme();
  if (!batch) return null;
  const failed = batch.orders.filter((order) => order.status === 'failed');
  const confirmable = batch.combined.perRetailer.length > 0;

  return (
    <View style={styles.block}>
      {batch.combined.perRetailer.map((line) => (
        <View key={line.retailer} style={styles.group}>
          <Text
            variant="caption"
            size="footnote"
            weight={600}
            color={colors.secondaryStrong}
            style={{ textTransform: 'uppercase' }}
          >
            {copy.retailerSection(line.retailer)}
          </Text>
          <PriceRow label={copy.retailerSubtotal(formatCents(line.subtotalCents, batch.combined.currency))} />
          <PriceRow label={`${copy.shippingLabel}: ${formatCents(line.shippingCents, batch.combined.currency)}`} />
          <PriceRow label={`${copy.taxLabel}: ${formatCents(line.taxCents, batch.combined.currency)}`} />
        </View>
      ))}

      {/* Any store that failed to resolve an offer falls back to its own site. */}
      {failed.map((order) => (
        <HandoffOutcome key={order.orderId} order={order} />
      ))}

      <Text variant="ui" size="subhead" weight={700} color={colors.text}>
        {copy.grandTotal(formatCents(batch.combined.grandTotalCents, batch.combined.currency))}
      </Text>

      {/* Commission disclosure AT the transaction (Axiom/FTC), beside the amount
          being authorized — not only in the Shop feed two screens back. */}
      <Text variant="caption" size="footnote" color={colors.secondary}>
        {copy.commissionDisclosure}
      </Text>

      {confirmable ? (
        <Button label={copy.confirmPurchase} onPress={onConfirm} disabled={busy} haptic />
      ) : null}
    </View>
  );
}

/** Patient per-store "placing your order" lines while orders are placed. */
function ConfirmingView({
  batch,
  groups,
}: {
  readonly batch: CheckoutBatch | null;
  readonly groups: ReturnType<typeof groupCartByRetailer>;
}) {
  const { colors } = useTheme();
  const retailers =
    batch && batch.combined.perRetailer.length > 0
      ? batch.combined.perRetailer.map((line) => line.retailer)
      : groups.map((group) => group.retailer);
  return (
    <View style={styles.block}>
      <ActivityIndicator color={colors.text} />
      {retailers.map((retailer) => (
        <Text
          key={retailer}
          variant="body"
          color={colors.secondaryStrong}
          style={{ textAlign: 'center' }}
        >
          {copy.placingOrder(retailer)}
        </Text>
      ))}
    </View>
  );
}

/** The honest per-store outcomes once the checkout settles. */
function DoneView({
  batch,
  onClose,
}: {
  readonly batch: CheckoutBatch | null;
  readonly onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      {(batch?.orders ?? []).map((order) =>
        order.status === 'completed' ? (
          <Text key={order.orderId} variant="body" color={colors.text}>
            {copy.orderPlaced(order.retailer)}
          </Text>
        ) : (
          <HandoffOutcome key={order.orderId} order={order} />
        ),
      )}
      <Button label={strings.common.continue} onPress={onClose} />
    </View>
  );
}

/** A failed store's calm outcome line + its affiliate tap-out. */
function HandoffOutcome({ order }: { readonly order: BatchOrder }) {
  const { colors } = useTheme();
  return (
    <Text key={order.orderId} variant="body" color={colors.secondaryStrong}>
      {copy.orderFailed(order.retailer)}
    </Text>
  );
}

/** A single price line inside a review breakdown. */
function PriceRow({ label }: { readonly label: string }) {
  const { colors } = useTheme();
  return (
    <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
      {label}
    </Text>
  );
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

/** Normalize a retailer for grouping match — mirrors core's trim().toLowerCase(). */
function normalize(retailer: string): string {
  return retailer.trim().toLowerCase();
}

/** The saved-sizes patch for a chosen size in a given dimension. */
function patchForKind(kind: ReturnType<typeof sizeKindForCategory>, size: string): Partial<UserSizes> {
  switch (kind) {
    case 'apparel':
      return { apparelSize: size };
    case 'denim':
      return { denimSize: size };
    case 'shoe':
      return { shoeSize: size };
    case 'one_size':
      return {};
  }
}

/** A compact one-line address summary for the cart's shipping row. */
function summarizeAddress(a: ShippingAddress): string {
  return [`${a.firstName} ${a.lastName}`.trim(), a.address1, `${a.city}, ${a.province} ${a.postalCode}`.trim()]
    .filter((part) => part.length > 0)
    .join(' · ');
}

/** True only for a well-formed https URL. Guards the native open against a hostile scheme. */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Route a typed checkout error to the caller's calm handlers. */
function handleCheckoutError(
  error: unknown,
  handlers: {
    onNoAddress?: () => void;
    onEmptyCart?: () => void;
    onInvalidState?: () => void;
    onCalm: (message: string) => void;
  },
): void {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NoAddressError':
      (handlers.onNoAddress ?? (() => handlers.onCalm(copy.checkoutError)))();
      return;
    case 'EmptyCartError':
      (handlers.onEmptyCart ?? (() => handlers.onCalm(copy.checkoutError)))();
      return;
    case 'InvalidStateError':
      (handlers.onInvalidState ?? (() => handlers.onCalm(copy.checkoutError)))();
      return;
    default:
      // DailyLimitError / NotConfiguredError / CheckoutUnavailableError / generic —
      // all calm, cart intact.
      handlers.onCalm(copy.checkoutError);
  }
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.s3,
    paddingBottom: spacing.s6,
  },
  block: {
    gap: spacing.s4,
  },
  group: {
    gap: spacing.s2,
  },
  line: {
    gap: spacing.s2,
  },
  lineTop: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignItems: 'flex-start',
  },
  thumb: {
    width: spacing.s12,
    height: spacing.s12,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  lineInfo: {
    flex: 1,
    gap: spacing.s1,
  },
  sizeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: layout.touchTarget.ios,
  },
  sizePicker: {
    paddingLeft: spacing.s12 + spacing.s3,
  },
  removeBtn: {
    minHeight: layout.touchTarget.ios,
    justifyContent: 'center',
  },
  linkRow: {
    minHeight: layout.touchTarget.ios,
    justifyContent: 'center',
  },
});
