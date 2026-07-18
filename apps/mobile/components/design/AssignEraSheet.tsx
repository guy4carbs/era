/**
 * AssignEraSheet — drop the saved outfit into an era.
 *
 * A GlassSheet listing the caller's eras (tap to add the outfit) plus an inline
 * "start an era" field that creates one and assigns in a single step. Only shown
 * once an outfit has an id (i.e. after its first save). Copy is strings.design.*.
 */
import { strings } from '@era/core/strings';
import { radii, spacing } from '@era/tokens';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { GlassSheet } from '@/components/GlassSheet';
import { Input } from '@/components/Input';
import { useTheme } from '@/lib/theme';

import type { EraSummary } from './api';

interface AssignEraSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly eras: readonly EraSummary[];
  readonly busy: boolean;
  readonly onAssign: (eraId: string) => void;
  readonly onCreateAndAssign: (title: string) => void;
}

export function AssignEraSheet({
  open,
  onClose,
  eras,
  busy,
  onAssign,
  onCreateAndAssign,
}: AssignEraSheetProps) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');

  return (
    <GlassSheet open={open} onClose={onClose}>
      <Text
        accessibilityRole="header"
        variant="ui"
        size="title3"
        weight={600}
        color={colors.text}
      >
        {strings.design.assignToEra}
      </Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {eras.map((era) => (
          <Pressable
            key={era.id}
            accessibilityRole="button"
            accessibilityLabel={era.title}
            disabled={busy}
            onPress={() => onAssign(era.id)}
            style={[styles.row, { borderColor: colors.hairline, borderRadius: radii.input }]}
          >
            <Text variant="body" color={colors.text}>
              {era.title}
            </Text>
            <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
              {strings.design.outfitItemCount(era.outfitCount)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.create}>
        <Input
          placeholder={strings.design.eraTitlePlaceholder}
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
          editable={!busy}
        />
        <Button
          label={strings.design.newEra}
          variant="secondary"
          disabled={busy || title.trim().length === 0}
          onPress={() => {
            onCreateAndAssign(title.trim());
            setTitle('');
          }}
        />
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: spacing.s16 * 3,
  },
  listContent: {
    gap: spacing.s2,
    paddingVertical: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  create: {
    gap: spacing.s3,
    paddingTop: spacing.s2,
  },
});
