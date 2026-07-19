/**
 * TodayCard — Ovi's daily suggestion at the top of the Feed, staged as the D9
 * reveal ritual.
 *
 * On mount it asks `/api/ovi/today` for one look for today, then resolves the
 * proposal's item ids to their closet cutouts (url + category) and hands the whole
 * thing to {@link RevealStage} — the one Today surface. The reveal plays its staged
 * assembly on the first feed visit of the day (`playReveal`, gated once-per-day by
 * feed.tsx) and renders already-composed on every later visit. Wear it saves the
 * look AND logs the wear; Something else dismisses it; Share exports the composed
 * reveal as a Stories card through the shared offscreen collage host.
 *
 * When the closet is too thin to suggest anything, it holds the honest empty line
 * instead. Location is optional and currently omitted (the app declares no
 * geolocation dependency), so the suggestion is weatherless — still grounded in the
 * closet.
 */
import { spacing } from '@era/tokens';
import type { ProposedOutfit } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Toast } from '@/components/closet/Toast';
import { fetchItems } from '@/components/items/api';
import { useCollageExport } from '@/components/share';
import { logWear } from '@/components/ovi/api';
import { useTheme } from '@/lib/theme';

import { acceptOutfit, fetchToday, rejectOutfit, type OviWeather } from './api';
import { RevealStage } from './RevealStage';

interface TodayCardProps {
  /**
   * Whether the reveal should play its staged assembly (the first feed visit of
   * the day) or render already-composed. feed.tsx owns the once-per-day gate.
   * Defaults to composed so a bare mount never surprises with a full ritual.
   */
  readonly playReveal?: boolean;
  /** Fired once the reveal reaches the composed card — feed.tsx marks the day seen. */
  readonly onRevealSettled?: () => void;
}

export function TodayCard({ playReveal = false, onRevealSettled }: TodayCardProps) {
  const { colors } = useTheme();
  const { exportToday, busy: sharePreparing } = useCollageExport();

  const [loading, setLoading] = useState(true);
  const [outfit, setOutfit] = useState<ProposedOutfit | null>(null);
  const [weather, setWeather] = useState<OviWeather | null>(null);
  const [revealLine, setRevealLine] = useState<string | null>(null);
  const [urlById, setUrlById] = useState<ReadonlyMap<string, string>>(new Map());
  const [categoryById, setCategoryById] = useState<ReadonlyMap<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        setRevealLine(today.revealLine);
        if (today.outfit) {
          const urls = new Map<string, string>();
          const categories = new Map<string, string>();
          for (const item of items) {
            if (item.displayUrl) urls.set(item.id, item.displayUrl);
            categories.set(item.id, item.category);
          }
          setUrlById(urls);
          setCategoryById(categories);
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

  // The composed reveal's cutout urls, in slot order — reused for the Stories export.
  const cutoutUrls = useMemo(() => {
    if (!outfit) return [] as string[];
    const urls: string[] = [];
    for (const id of outfit.itemIds) {
      const url = urlById.get(id);
      if (url) urls.push(url);
    }
    return urls;
  }, [outfit, urlById]);

  if (loading || failedRef.current || dismissed) {
    return null;
  }

  // No look to reveal — the honest empty line, not a ritual.
  if (!outfit) {
    return (
      <View style={styles.card}>
        <Text variant="title" color={colors.text}>
          {strings.ovi.todayTitle}
        </Text>
        <Text variant="body" size="subhead" color={colors.secondary}>
          {strings.ovi.todayEmpty}
        </Text>
        <Toast message={toast} onHide={() => setToast(null)} bottom={spacing.s2} />
      </View>
    );
  }

  const onWear = () => {
    setSaving(true);
    // Wear it both saves the look (accept) AND logs the wear — the single quiet
    // primary the reveal collapses TodayCard's accept + WoreIt grammar into.
    void acceptOutfit({
      name: outfit.name,
      occasion: outfit.occasion,
      itemIds: outfit.itemIds,
      intent: 'today',
      rationale: outfit.rationale,
    })
      .then(() => logWear({ itemIds: outfit.itemIds }))
      .then(() => {
        setSaved(true);
        setToast(strings.outfits.wearLogged);
      })
      .catch(() => {
        setToast(strings.errors.generic);
      })
      .finally(() => setSaving(false));
  };

  const onElse = () => {
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

  const onShare = () => {
    exportToday({ cutoutUrls, revealLine });
  };

  return (
    <View style={styles.card}>
      <RevealStage
        outfit={outfit}
        urlById={urlById}
        categoryById={categoryById}
        weather={weather}
        revealLine={revealLine}
        initiallySettled={!playReveal}
        onSettled={onRevealSettled}
        onWear={onWear}
        onElse={onElse}
        onShare={onShare}
        busy={saving}
        saved={saved}
        sharePreparing={sharePreparing}
      />
      <Toast message={toast} onHide={() => setToast(null)} bottom={spacing.s2} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s3,
  },
});
