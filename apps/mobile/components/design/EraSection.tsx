/**
 * EraSection — the Design tab's eras list, with inline creation.
 *
 * A heading, a horizontal rail of era cards (each a member-cover collage, title,
 * and outfit count), and an inline "start an era" field. The era's own cover (or
 * its member outfits' covers) drives the collage. Copy is strings.design.*.
 */
import { strings } from '@era/core/strings';
import { radii, spacing, typeRamp } from '@era/tokens';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useTheme } from '@/lib/theme';

import { Collage } from './Collage';
import type { EraSummary } from './api';

interface EraSectionProps {
  readonly eras: readonly EraSummary[];
  readonly busy: boolean;
  readonly onCreate: (title: string) => void;
}

export function EraSection({ eras, busy, onCreate }: EraSectionProps) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: typeRamp.title3.pt,
          lineHeight: typeRamp.title3.lineHeight,
          fontWeight: '600',
        }}
      >
        {strings.design.eraSectionTitle}
      </Text>

      {eras.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {eras.map((era) => (
            <View key={era.id} style={styles.eraCard}>
              <View style={[styles.cover, { borderRadius: radii.card }]}>
                <Collage cover={era.coverUrl} images={era.outfitCovers} />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: typeRamp.subhead.pt,
                  lineHeight: typeRamp.subhead.lineHeight,
                  fontWeight: '600',
                }}
              >
                {era.title}
              </Text>
              <Text
                style={{
                  color: colors.secondaryStrong,
                  fontSize: typeRamp.footnote.pt,
                  lineHeight: typeRamp.footnote.lineHeight,
                }}
              >
                {strings.design.outfitItemCount(era.outfitCount)}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.create}>
        <Input
          containerStyle={styles.createInput}
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
            onCreate(title.trim());
            setTitle('');
          }}
        />
      </View>
    </View>
  );
}

// A member-cover tile in the era rail — a touch narrower than a full outfit card.
const ERA_CARD_WIDTH = spacing.s16 * 2;

const styles = StyleSheet.create({
  section: {
    gap: spacing.s4,
  },
  rail: {
    flexDirection: 'row',
    gap: spacing.s3,
    paddingRight: spacing.s4,
  },
  eraCard: {
    width: ERA_CARD_WIDTH,
    gap: spacing.s2,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  create: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
  },
  createInput: {
    flex: 1,
  },
});
