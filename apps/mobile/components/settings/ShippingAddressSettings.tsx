/**
 * ShippingAddressSettings — the Settings section for the one saved shipping
 * address used by in-flow checkout. Reads the address on mount and renders one of:
 *   - none    → an "Add a shipping address" button that opens the capture form
 *   - summary → the address, an Edit affordance, and a destructive Remove
 *   - editing → the shared {@link ShippingAddressForm} (PUT on save)
 *   - error   → a quiet "Try again" that re-fetches (never a wrong state)
 * The address is PII — the Remove row wipes it server-side. Only mounted by the
 * Settings screen when the cosmetic checkout flag is on. Mirrors the
 * {@link ReceiptAddressSettings} section shape.
 */
import { layout, spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { SettingRow } from '@/components/settings/SettingRow';
import { useTheme } from '@/lib/theme';

import { ShippingAddressForm } from '@/components/checkout/ShippingAddressForm';
import {
  deleteShippingAddress,
  getShippingAddress,
  hasShippingAddress,
  putShippingAddress,
  type ShippingAddress,
} from '@/components/checkout/api';
import { checkoutCopy } from '@/components/checkout/copy';

const copy = strings.shop.checkout;

/** The section's view state: still loading, a read failure, or the resolved address (or null). */
type AddressView = 'loading' | 'error' | 'editing' | { readonly address: ShippingAddress | null };

interface ShippingAddressSettingsProps {
  /** Raise a transient confirmation/failure line on the screen's toast. */
  readonly onToast: (message: string) => void;
}

export function ShippingAddressSettings({ onToast }: ShippingAddressSettingsProps) {
  const { colors } = useTheme();
  const [view, setView] = useState<AddressView>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void load(active, setView);
    return () => {
      active = false;
    };
  }, []);

  const saved = typeof view === 'object' ? view.address : null;

  const onSave = async (address: ShippingAddress) => {
    setBusy(true);
    try {
      const next = await putShippingAddress(address);
      setView({ address: next });
    } catch {
      onToast(strings.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteShippingAddress();
      setView({ address: null });
    } catch {
      onToast(strings.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  if (view === 'loading') {
    return <ActivityIndicator color={colors.text} style={styles.loading} />;
  }

  if (view === 'error') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.errors.retry}
        onPress={() => {
          setView('loading');
          void load(true, setView);
        }}
        style={styles.retryRow}
      >
        <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
          {strings.errors.retry}
        </Text>
      </Pressable>
    );
  }

  if (view === 'editing') {
    return (
      <View style={styles.container}>
        <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
          {checkoutCopy.shippingExplain}
        </Text>
        <ShippingAddressForm
          initial={saved}
          busy={busy}
          onSubmit={(address) => void onSave(address)}
          onCancel={() => setView({ address: saved })}
        />
      </View>
    );
  }

  // Resolved: a saved address (summary) or none (invite to add).
  if (!saved) {
    return (
      <View style={styles.container}>
        <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
          {checkoutCopy.shippingExplain}
        </Text>
        <Button
          label={copy.addAddress}
          variant="secondary"
          onPress={() => setView('editing')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text
        variant="caption"
        size="footnote"
        weight={600}
        color={colors.secondaryStrong}
        style={styles.eyebrow}
      >
        {copy.shippingTo}
      </Text>
      <Text variant="body" color={colors.text}>
        {formatAddress(saved)}
      </Text>
      <SettingRow label={checkoutCopy.editAddress} onPress={() => setView('editing')} />
      <SettingRow
        label={checkoutCopy.deleteAddress}
        destructive
        onPress={() => void onRemove()}
      />
    </View>
  );
}

/** One-line-per-part address summary; the two optional fields are dropped when blank. */
function formatAddress(a: ShippingAddress): string {
  const lines = [
    `${a.firstName} ${a.lastName}`.trim(),
    a.address1,
    a.address2,
    `${a.city}, ${a.province} ${a.postalCode}`.trim(),
    a.country,
  ];
  return lines.filter((line) => line && line.length > 0).join('\n');
}

/** Fetch the address into state; a read failure resolves to the retryable 'error' state. */
async function load(active: boolean, setView: (v: AddressView) => void): Promise<void> {
  try {
    const state = await getShippingAddress();
    if (active) setView({ address: hasShippingAddress(state) ? state : null });
  } catch {
    if (active) setView('error');
  }
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s3,
  },
  loading: {
    paddingVertical: spacing.s4,
    alignSelf: 'flex-start',
  },
  retryRow: {
    minHeight: layout.touchTarget.ios,
    justifyContent: 'center',
  },
  eyebrow: {
    textTransform: 'uppercase',
  },
});
