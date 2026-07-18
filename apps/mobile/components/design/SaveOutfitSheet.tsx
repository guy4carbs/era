/**
 * SaveOutfitSheet — names the look and saves it.
 *
 * A GlassSheet form with optional name + occasion fields and the save CTA. While
 * the cover is composed and the outfit is written, it shows the `saving` line and
 * disables the button. Copy is strings.design.* throughout.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { GlassSheet } from '@/components/GlassSheet';
import { Input } from '@/components/Input';
import { useTheme } from '@/lib/theme';

interface SaveOutfitSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly initialName: string;
  readonly initialOccasion: string;
  readonly saving: boolean;
  readonly onSave: (name: string, occasion: string) => void;
}

export function SaveOutfitSheet({
  open,
  onClose,
  initialName,
  initialOccasion,
  saving,
  onSave,
}: SaveOutfitSheetProps) {
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);
  const [occasion, setOccasion] = useState(initialOccasion);

  // Re-seed from the outfit whenever the sheet opens (reopen carries prior values).
  useEffect(() => {
    if (open) {
      setName(initialName);
      setOccasion(initialOccasion);
    }
  }, [open, initialName, initialOccasion]);

  return (
    <GlassSheet open={open} onClose={onClose}>
      <View style={styles.form}>
        <Input
          placeholder={strings.design.outfitNamePlaceholder}
          value={name}
          onChangeText={setName}
          returnKeyType="next"
          editable={!saving}
        />
        <Input
          placeholder={strings.design.occasionPlaceholder}
          value={occasion}
          onChangeText={setOccasion}
          returnKeyType="done"
          editable={!saving}
        />

        {saving ? (
          <Text variant="body" size="subhead" color={colors.secondaryStrong}>
            {strings.design.saving}
          </Text>
        ) : null}

        <Button
          label={strings.design.saveOutfit}
          onPress={() => onSave(name.trim(), occasion.trim())}
          disabled={saving}
          haptic
        />
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.s4,
  },
});
