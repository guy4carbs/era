/**
 * WearCalendar — a quiet month grid of what got worn.
 *
 * Seven columns, Sunday-first, offset by the 1st's weekday. A day with any wears
 * carries a soft accent dot; today (in the current month) carries an accent ring.
 * Tapping a day expands an inline strip of that day's pieces (thumbnails + names)
 * below the grid — the lightest reveal, no sheet. Tapping it again collapses it.
 *
 * Utility, not a dashboard: tokens-only colour so it reads in both themes, no
 * motion of its own, and it renders inside the worn screen's scroll (owns no
 * safe-area). Data is the month's `groupWearsByDay` map plus the month's items.
 */
import type { WearLogLike } from '@era/core/wear-stats';
import { strings } from '@era/core/strings';
import { radii, spacing, typeRamp } from '@era/tokens';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import type { WearMonthItem } from './api';
import { WEEKDAY_LABELS, currentMonth, dayDate, firstWeekdayOf, localToday } from './format';

/** Seven columns — each cell is exactly a seventh so the grid wraps cleanly. */
const CELL_WIDTH = `${100 / 7}%`;

interface WearCalendarProps {
  readonly month: string;
  readonly daysInMonth: number;
  /** The month's logs grouped by `wornOn` — exactly `groupWearsByDay`'s output. */
  readonly byDay: Map<string, WearLogLike[]>;
  readonly items: readonly WearMonthItem[];
}

export function WearCalendar({ month, daysInMonth, byDay, items }: WearCalendarProps) {
  const { colors } = useTheme();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const leading = firstWeekdayOf(month);
  const today = month === currentMonth() ? localToday() : null;

  // The pieces worn on the selected day, deduped across that day's logs and
  // resolved to owned items (unknown/outfit-only ids simply drop out).
  const selectedItems = useMemo(() => {
    if (selectedDay === null) return [];
    const seen = new Set<string>();
    const resolved: WearMonthItem[] = [];
    for (const log of byDay.get(selectedDay) ?? []) {
      for (const id of log.itemIds ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const item = itemById.get(id);
        if (item) resolved.push(item);
      }
    }
    return resolved;
  }, [selectedDay, byDay, itemById]);

  return (
    <View style={styles.container}>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <View key={index} style={styles.weekCell}>
            <Text
              style={{
                color: colors.secondary,
                fontSize: typeRamp.caption.pt,
                lineHeight: typeRamp.caption.lineHeight,
                fontWeight: '600',
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: leading }).map((_, index) => (
          <View key={`lead-${index}`} style={styles.cell} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const date = dayDate(month, day);
          const count = byDay.get(date)?.length ?? 0;
          const isToday = date === today;
          const isSelected = date === selectedDay;
          return (
            <View key={date} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${day}, ${strings.wear.calendar.dayA11y(count)}`}
                onPress={() => setSelectedDay((current) => (current === date ? null : date))}
                style={[
                  styles.dayInner,
                  { borderColor: isToday ? colors.accent : 'transparent' },
                  isSelected ? { backgroundColor: colors.surface, borderColor: colors.hairline } : null,
                ]}
              >
                <Text
                  style={{
                    color: count > 0 ? colors.text : colors.secondary,
                    fontSize: typeRamp.footnote.pt,
                    lineHeight: typeRamp.footnote.lineHeight,
                    fontWeight: count > 0 ? '600' : '400',
                  }}
                >
                  {day}
                </Text>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: count > 0 ? colors.accent : 'transparent' },
                  ]}
                />
              </Pressable>
            </View>
          );
        })}
      </View>

      {selectedItems.length > 0 ? (
        <View style={styles.dayStrip}>
          {selectedItems.map((item) => (
            <View key={item.id} style={styles.chip}>
              <View style={[styles.chipThumb, { backgroundColor: colors.bg, borderColor: colors.hairline }]}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="contain"
                    accessibilityLabel={item.name}
                  />
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: colors.secondaryStrong,
                  fontSize: typeRamp.caption.pt,
                  lineHeight: typeRamp.caption.lineHeight,
                }}
              >
                {item.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s2,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    paddingVertical: spacing.s1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL_WIDTH,
    aspectRatio: 1,
    padding: spacing.s1,
  },
  dayInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    borderRadius: radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  dot: {
    width: spacing.s1,
    height: spacing.s1,
    borderRadius: spacing.s1 / 2,
  },
  dayStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
    paddingTop: spacing.s2,
  },
  chip: {
    width: spacing.s16,
    gap: spacing.s1,
  },
  chipThumb: {
    width: spacing.s16,
    height: spacing.s16,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
