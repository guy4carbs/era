/**
 * Worn — the wear calendar + monthly recap, pushed over the tabs from the Closet
 * header (the same way Settings is reached). One viewed month drives both: the
 * "your month, worn" recap card sits at the top, the day grid below it, and prev/
 * next chevrons move the window (never past the current month — nothing is logged
 * in the future).
 *
 * The month's `{ logs, items }` comes from `GET /api/wear-logs?month=`; the recap
 * and the day grouping are built client-side by `@era/core/wear-stats`, so the
 * server stays a plain reader. An unauthenticated visitor is bounced to sign-in.
 * Colour, type, and copy come from tokens and strings only.
 */
import { buildMonthlyRecap, groupWearsByDay, type RecapItemLike } from '@era/core/wear-stats';
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import { Redirect, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';
import {
  MonthlyRecapCard,
  WearCalendar,
  currentMonth,
  fetchWearMonth,
  monthAtOrBefore,
  monthLabel,
  shiftMonth,
  type WearMonth,
} from '@/components/wear';

type LoadState = 'loading' | 'ready' | 'error';

// Route files require a default export — expo-router discovers screens this way.
export default function WornScreen() {
  const { colors } = useTheme();
  const { data, isPending } = useSession();

  const [month, setMonth] = useState(currentMonth);
  const [payload, setPayload] = useState<WearMonth | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  // Bumped by Retry to re-run the fetch effect without duplicating its logic.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState('loading');
    void fetchWearMonth(month)
      .then((next) => {
        if (!active) return;
        setPayload(next);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [month, reloadKey]);

  // The recap + day grouping are pure derivations of the month's payload.
  const recap = useMemo(() => {
    if (payload === null) return null;
    // buildMonthlyRecap ignores imageUrl; pass the price/category slice it needs.
    const recapItems: RecapItemLike[] = payload.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      purchasePrice: item.purchasePrice,
    }));
    return buildMonthlyRecap(payload.logs, recapItems, month);
  }, [payload, month]);

  const byDay = useMemo(() => (payload === null ? null : groupWearsByDay(payload.logs)), [payload]);

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: true, title: strings.wear.calendar.title }} />
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  const canGoNext = monthAtOrBefore(shiftMonth(month, 1), currentMonth());

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: true, title: strings.wear.calendar.title }} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.monthNav}>
          <MonthChevron
            glyph="‹"
            label={monthLabel(shiftMonth(month, -1))}
            onPress={() => setMonth((current) => shiftMonth(current, -1))}
          />
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: typeRamp.title2.pt,
              lineHeight: typeRamp.title2.lineHeight,
              fontWeight: '600',
            }}
          >
            {monthLabel(month)}
          </Text>
          <MonthChevron
            glyph="›"
            label={monthLabel(shiftMonth(month, 1))}
            disabled={!canGoNext}
            onPress={() => setMonth((current) => shiftMonth(current, 1))}
          />
        </View>

        {state === 'loading' ? (
          <View style={styles.centeredBlock}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : state === 'error' ? (
          <View style={styles.centeredBlock}>
            <Text
              style={{
                color: colors.secondaryStrong,
                fontSize: typeRamp.body.pt,
                lineHeight: typeRamp.body.lineHeight,
                textAlign: 'center',
              }}
            >
              {strings.errors.generic}
            </Text>
            <Button
              label={strings.errors.retry}
              variant="secondary"
              onPress={() => setReloadKey((key) => key + 1)}
            />
          </View>
        ) : recap !== null && byDay !== null && payload !== null ? (
          <>
            <MonthlyRecapCard recap={recap} items={payload.items} />
            <WearCalendar
              month={month}
              daysInMonth={recap.daysInMonth}
              byDay={byDay}
              items={payload.items}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** A month-step chevron — a label-only glyph, like the closet's SettingsGear. */
function MonthChevron({
  glyph,
  label,
  onPress,
  disabled = false,
}: {
  readonly glyph: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={spacing.s3}
      onPress={onPress}
      style={styles.chevron}
    >
      <Text style={{ color: disabled ? colors.secondary : colors.text, fontSize: typeRamp.title1.pt }}>
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s12,
    gap: spacing.s6,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingVertical: spacing.s12,
  },
});
