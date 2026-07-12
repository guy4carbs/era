/**
 * Paywall — the Era+ upgrade screen, presented as a modal over the app.
 *
 * expo-router registers this file as `/paywall`; the root Stack gives it
 * `presentation: 'modal'`. It is reachable only when the Era+ flag is on (the
 * Settings entry is flag-gated, and this route re-checks the flag so a stale
 * deep link can't surface it) and only for a signed-in user.
 *
 * Everything visible here is copy from `@era/core` strings and colour/type from
 * tokens — the only literal runtime text is RevenueCat's already-localized price
 * string. The flow is deliberately calm per the product bar: the annual plan is
 * the emphasised default, the savings note is honest (no fake urgency), and a
 * "Not now" escape is always present.
 *
 * SERVER IS THE SOURCE OF TRUTH for the entitlement. The `entitled` state here is
 * RevenueCat's local read, used only for immediate post-purchase / post-restore
 * UX; the durable grant lives in the server subscriptions cache.
 */
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PlanCard } from '@/components/plus';
import { useSession } from '@/lib/auth-client';
import {
  eraPlusEnabled,
  getPlusEntitlement,
  getPlusOfferings,
  purchasePlusPlan,
  restorePlusPurchases,
  type PlusPlan,
} from '@/lib/purchases';
import { useTheme } from '@/lib/theme';

// Apple's deep link to the user's subscription management. Handing an active
// subscriber here (rather than a bespoke cancel flow) is the App Store idiom.
const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

type OfferPhase = 'loading' | 'offer' | 'error' | 'dormant';
type Plan = 'monthly' | 'annual';

// Route files require a default export — expo-router discovers screens this way.
export default function PaywallRoute() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isPending } = useSession();

  const [phase, setPhase] = useState<OfferPhase>('loading');
  const [monthly, setMonthly] = useState<PlusPlan | null>(null);
  const [annual, setAnnual] = useState<PlusPlan | null>(null);
  const [selected, setSelected] = useState<Plan>('annual');
  // Local RevenueCat read — immediate UX only; the server is authoritative.
  const [entitled, setEntitled] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // A single polite live-region line beneath the actions for purchase/restore
  // outcomes, in brand voice. Mirrors the inline-status idiom in DeleteAccountSheet.
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setNotice(null);
    const [entitlement, offerings] = await Promise.all([getPlusEntitlement(), getPlusOfferings()]);
    if (entitlement.status === 'ok' && entitlement.isPlus) {
      setEntitled(true);
    }
    switch (offerings.status) {
      case 'ok':
        setMonthly(offerings.monthly);
        setAnnual(offerings.annual);
        // A configured offering with neither plan present is a misconfiguration,
        // not a purchasable state — surface it as an error, not an empty paywall.
        setPhase(offerings.monthly || offerings.annual ? 'offer' : 'error');
        break;
      case 'dormant':
        setPhase('dormant');
        break;
      case 'error':
        setPhase('error');
        break;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

  const openManageSubscription = useCallback(() => {
    void Linking.openURL(APPLE_MANAGE_SUBSCRIPTIONS_URL);
  }, []);

  const handlePurchase = useCallback(async () => {
    const plan = selected === 'annual' ? annual : monthly;
    if (!plan) {
      return;
    }
    setPurchasing(true);
    setNotice(null);
    const result = await purchasePlusPlan(plan);
    setPurchasing(false);
    switch (result.status) {
      case 'purchased':
        // Reflect the grant locally; the server subscriptions cache is the truth.
        if (result.isPlus) {
          setEntitled(true);
        } else {
          setNotice(strings.errors.generic);
        }
        return;
      case 'cancelled':
        // A user cancel is not an error — stay calm and say nothing.
        return;
      case 'error':
        setNotice(strings.errors.generic);
        return;
      case 'dormant':
        // Unreachable from the offer phase (dormant renders its own state).
        return;
    }
  }, [selected, annual, monthly]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setNotice(null);
    const result = await restorePlusPurchases();
    setRestoring(false);
    switch (result.status) {
      case 'restored':
        if (result.isPlus) {
          setEntitled(true);
        } else {
          setNotice(strings.plus.restoreEmpty);
        }
        return;
      case 'error':
        setNotice(strings.errors.generic);
        return;
      case 'dormant':
        return;
    }
  }, []);

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  // Every control is account-scoped; an unauthenticated visitor goes to sign-in.
  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  // Flag off (or a stale deep link) → the feature does not exist; bounce home.
  if (!eraPlusEnabled) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ presentation: 'modal' }} />

      <View style={styles.header}>
        <Button label={strings.common.notNow} variant="ghost" onPress={dismiss} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {entitled ? (
          <ManagementState onManage={openManageSubscription} />
        ) : phase === 'loading' ? (
          <View style={styles.centeredBlock}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : phase === 'dormant' ? (
          <View style={styles.messageBlock}>
            <Text
              accessibilityRole="header"
              style={{
                color: colors.text,
                fontSize: typeRamp.title2.pt,
                lineHeight: typeRamp.title2.lineHeight,
                fontWeight: '700',
              }}
            >
              {strings.plus.paywallTitle}
            </Text>
            <Text
              style={{
                color: colors.secondaryStrong,
                fontSize: typeRamp.body.pt,
                lineHeight: typeRamp.body.lineHeight,
              }}
            >
              {strings.plus.unavailable}
            </Text>
          </View>
        ) : phase === 'error' ? (
          <View style={styles.messageBlock}>
            <Text
              style={{
                color: colors.secondaryStrong,
                fontSize: typeRamp.body.pt,
                lineHeight: typeRamp.body.lineHeight,
              }}
            >
              {strings.errors.generic}
            </Text>
            <Button label={strings.errors.retry} variant="secondary" onPress={() => void load()} />
          </View>
        ) : (
          <View style={styles.offer}>
            <View style={styles.intro}>
              <Text
                accessibilityRole="header"
                style={{
                  color: colors.text,
                  fontSize: typeRamp.title1.pt,
                  lineHeight: typeRamp.title1.lineHeight,
                  fontWeight: '700',
                }}
              >
                {strings.plus.paywallTitle}
              </Text>
              <Text
                style={{
                  color: colors.secondaryStrong,
                  fontSize: typeRamp.body.pt,
                  lineHeight: typeRamp.body.lineHeight,
                }}
              >
                {strings.plus.paywallSubtitle}
              </Text>
            </View>

            <View style={styles.plans}>
              {annual ? (
                <PlanCard
                  label={strings.plus.annualLabel}
                  priceString={annual.priceString}
                  primary
                  selected={selected === 'annual'}
                  onSelect={() => setSelected('annual')}
                />
              ) : null}
              {monthly ? (
                <PlanCard
                  label={strings.plus.monthlyLabel}
                  priceString={monthly.priceString}
                  selected={selected === 'monthly'}
                  onSelect={() => setSelected('monthly')}
                />
              ) : null}
            </View>

            {/* Honest annual savings — no fake urgency, no countdown. */}
            <Text
              style={{
                color: colors.secondary,
                fontSize: typeRamp.footnote.pt,
                lineHeight: typeRamp.footnote.lineHeight,
              }}
            >
              {strings.plus.honestAnnualNote}
            </Text>

            <Button
              // StoreKit's native purchase sheet takes over immediately on tap,
              // so a busy label would barely show — disabling is enough feedback.
              label={strings.common.continue}
              variant="primary"
              haptic
              disabled={purchasing || restoring}
              onPress={() => void handlePurchase()}
            />

            {notice ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{
                  color: colors.secondaryStrong,
                  fontSize: typeRamp.footnote.pt,
                  lineHeight: typeRamp.footnote.lineHeight,
                }}
              >
                {notice}
              </Text>
            ) : null}

            <Button
              label={strings.plus.restoreCta}
              variant="ghost"
              disabled={purchasing || restoring}
              onPress={() => void handleRestore()}
            />

            <Text
              style={{
                color: colors.secondary,
                fontSize: typeRamp.caption.pt,
                lineHeight: typeRamp.caption.lineHeight,
                textAlign: 'center',
              }}
            >
              {strings.plus.cancelAnytime}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The calm already-subscribed state: a plain acknowledgement plus a link out to
 * Apple's subscription management. No cancel flow of our own — Apple owns it.
 */
function ManagementState({ onManage }: { readonly onManage: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.offer}>
      <View style={styles.intro}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontSize: typeRamp.title1.pt,
            lineHeight: typeRamp.title1.lineHeight,
            fontWeight: '700',
          }}
        >
          {strings.plus.alreadyPlus}
        </Text>
      </View>

      <Button label={strings.plus.managePlan} variant="secondary" onPress={onManage} />

      <Text
        style={{
          color: colors.secondary,
          fontSize: typeRamp.caption.pt,
          lineHeight: typeRamp.caption.lineHeight,
          textAlign: 'center',
        }}
      >
        {strings.plus.cancelAnytime}
      </Text>
    </View>
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
  centeredBlock: {
    paddingVertical: spacing.s16,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  content: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s8,
  },
  messageBlock: {
    paddingTop: spacing.s8,
    gap: spacing.s4,
  },
  offer: {
    gap: spacing.s4,
  },
  intro: {
    gap: spacing.s2,
    paddingBottom: spacing.s2,
  },
  plans: {
    gap: spacing.s3,
  },
});
