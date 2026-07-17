/**
 * ShippingAddressForm — the inline capture/edit form for the one saved shipping
 * address. Shared by the cart sheet (first checkout needs an address) and the
 * Settings shipping row. All {@link CheckoutBuyer} fields MINUS email (email comes
 * from the session at checkout); `country` is an ISO-2 code. Required fields are
 * validated on submit with a plain "Required" marker; the two optional fields
 * (phone, address2) never block. The parent owns the async (PUT + busy state); this
 * is a controlled, presentational form that just gathers a valid address.
 */
import { spacing, typeRamp } from '@era/tokens';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { strings } from '@era/core/strings';
import { useTheme } from '@/lib/theme';

import { checkoutCopy } from './copy';
import type { ShippingAddress } from './api';

interface ShippingAddressFormProps {
  readonly initial?: ShippingAddress | null;
  readonly busy: boolean;
  readonly onSubmit: (address: ShippingAddress) => void;
  readonly onCancel?: () => void;
}

/** The required text fields, in render order — each must be non-empty to submit. */
const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'address1',
  'city',
  'province',
  'postalCode',
  'country',
] as const;

type FieldKey = keyof typeof checkoutCopy.fields;

/** A blank draft, or the saved address hydrated for editing. */
function draftFrom(initial?: ShippingAddress | null): Record<FieldKey, string> {
  return {
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    phone: initial?.phone ?? '',
    address1: initial?.address1 ?? '',
    address2: initial?.address2 ?? '',
    city: initial?.city ?? '',
    province: initial?.province ?? '',
    postalCode: initial?.postalCode ?? '',
    country: initial?.country ?? '',
  };
}

export function ShippingAddressForm({ initial, busy, onSubmit, onCancel }: ShippingAddressFormProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Record<FieldKey, string>>(() => draftFrom(initial));
  const [showErrors, setShowErrors] = useState(false);

  const set = (key: FieldKey, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  const missing = (key: FieldKey): boolean =>
    (REQUIRED_FIELDS as readonly string[]).includes(key) && draft[key].trim().length === 0;

  const handleSubmit = () => {
    const hasGaps = REQUIRED_FIELDS.some((key) => draft[key].trim().length === 0);
    if (hasGaps) {
      setShowErrors(true);
      return;
    }
    const address: ShippingAddress = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      address1: draft.address1.trim(),
      city: draft.city.trim(),
      province: draft.province.trim(),
      postalCode: draft.postalCode.trim(),
      country: draft.country.trim().toUpperCase(),
    };
    const phone = draft.phone.trim();
    const address2 = draft.address2.trim();
    onSubmit({
      ...address,
      ...(phone ? { phone } : {}),
      ...(address2 ? { address2 } : {}),
    });
  };

  const field = (key: FieldKey, extra?: Partial<React.ComponentProps<typeof Input>>) => {
    const meta = checkoutCopy.fields[key];
    return (
      <View style={styles.field}>
        <Text style={label(colors.secondaryStrong)}>{meta.label}</Text>
        <Input
          value={draft[key]}
          onChangeText={(text) => set(key, text)}
          placeholder={meta.placeholder}
          editable={!busy}
          error={showErrors && missing(key) ? checkoutCopy.fieldRequired : undefined}
          {...extra}
        />
      </View>
    );
  };

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <View style={styles.half}>{field('firstName', { autoCapitalize: 'words' })}</View>
        <View style={styles.half}>{field('lastName', { autoCapitalize: 'words' })}</View>
      </View>
      {field('address1')}
      {field('address2')}
      <View style={styles.row}>
        <View style={styles.half}>{field('city', { autoCapitalize: 'words' })}</View>
        <View style={styles.half}>{field('province', { autoCapitalize: 'words' })}</View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>{field('postalCode')}</View>
        <View style={styles.half}>
          {field('country', { autoCapitalize: 'characters', maxLength: 2 })}
          <Text style={caption(colors.secondary)}>{checkoutCopy.countryHelp}</Text>
        </View>
      </View>
      {field('phone', { keyboardType: 'phone-pad' })}

      <Button label={checkoutCopy.saveAddress} onPress={handleSubmit} disabled={busy} />
      {onCancel ? (
        <Button label={strings.common.cancel} variant="ghost" onPress={onCancel} disabled={busy} />
      ) : null}
    </View>
  );
}

/** Small uppercase-weight label above each field. */
function label(color: string) {
  return {
    color,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
    fontWeight: '600' as const,
  };
}

/** Plain footnote — the country-code helper line. */
function caption(color: string) {
  return {
    color,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
  };
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.s3,
  },
  field: {
    gap: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  half: {
    flex: 1,
  },
});
