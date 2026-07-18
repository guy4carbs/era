/**
 * TodayCard — Ovi's daily suggestion at the top of the Feed.
 *
 * On mount it asks `/api/ovi/today` for one look for today, then presents it as a
 * premium card: the "Today's look" heading, a weather lead when conditions came
 * back, and the proposed look as an {@link OutfitProposalCard} built from the
 * user's real cutouts — Save persists it, Not today dismisses it. When the closet
 * is too thin to suggest anything, it holds the honest empty line instead.
 *
 * Location is optional and currently omitted (the app declares no geolocation
 * dependency), so the suggestion is weatherless — still grounded in the closet.
 * Wiring a coarse, rounded coordinate here later turns the weather lead on.
 */
import { spacing } from '@era/tokens';
import type { ProposedOutfit } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Toast } from '@/components/closet/Toast';
import { fetchItems } from '@/components/items/api';
import { useTheme } from '@/lib/theme';

import { acceptOutfit, fetchToday, rejectOutfit, type OviWeather } from './api';
import { OutfitProposalCard, type ProposalStatus } from './OutfitProposalCard';
import { WoreItButton } from './WoreItButton';

export function TodayCard() {
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [outfit, setOutfit] = useState<ProposedOutfit | null>(null);
  const [weather, setWeather] = useState<OviWeather | null>(null);
  const [images, setImages] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<ProposalStatus>('idle');
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const failedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchToday(), fetchItems()])
      .then(([today, items]) => {
        if (!active) return;
        setOutfit(today.outfit);
        setWeather(today.weather);
        if (today.outfit) {
          const map = new Map<string, string>();
          for (const item of items) {
            if (item.displayUrl) map.set(item.id, item.displayUrl);
          }
          const urls: string[] = [];
          for (const id of today.outfit.itemIds) {
            const url = map.get(id);
            if (url) urls.push(url);
          }
          setImages(urls);
        }
      })
      .catch(() => {
        // A failed daily suggestion simply shows nothing — the Feed stays clean.
        failedRef.current = true;
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading || failedRef.current || dismissed) {
    return null;
  }

  const onSave = () => {
    if (!outfit) return;
    setStatus('saving');
    void acceptOutfit({
      name: outfit.name,
      occasion: outfit.occasion,
      itemIds: outfit.itemIds,
      intent: 'today',
      rationale: outfit.rationale,
    })
      .then(() => {
        setStatus('saved');
        setToast(strings.ovi.accepted);
      })
      .catch(() => {
        setStatus('idle');
        setToast(strings.ovi.rejected);
      });
  };

  const onReject = () => {
    if (!outfit) return;
    setToast(strings.ovi.rejected);
    setDismissed(true);
    void rejectOutfit({
      name: outfit.name,
      occasion: outfit.occasion,
      itemIds: outfit.itemIds,
      intent: 'today',
      rationale: outfit.rationale,
    }).catch(() => {
      // The reject is a pure signal; a failed event is not worth surfacing.
    });
  };

  return (
    <View style={styles.card}>
      <Text variant="title" color={colors.text}>
        {strings.ovi.todayTitle}
      </Text>

      {outfit && weather ? (
        <Text variant="body" size="subhead" color={colors.secondary}>
          {strings.ovi.weatherLine(weather.tempC, weather.condition)}
        </Text>
      ) : null}

      {outfit ? (
        <>
          <OutfitProposalCard
            outfit={outfit}
            images={images}
            status={status}
            onSave={onSave}
            onReject={onReject}
          />
          <WoreItButton itemIds={outfit.itemIds} via="today_card" onToast={setToast} />
        </>
      ) : (
        <Text variant="body" size="subhead" color={colors.secondary}>
          {strings.ovi.todayEmpty}
        </Text>
      )}

      <Toast message={toast} onHide={() => setToast(null)} bottom={spacing.s2} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s3,
  },
});
