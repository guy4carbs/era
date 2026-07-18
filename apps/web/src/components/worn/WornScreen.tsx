'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@era/core/strings';
import { buildMonthlyRecap } from '@era/core/wear-stats';
import { pressProps } from '../../lib/motion';
import { Container } from '../Container';
import { Text } from '../Text';
import { localMonthToday } from '../../lib/local-date';
import { MonthlyRecapCard } from './MonthlyRecapCard';
import { WearCalendar } from './WearCalendar';
import type { WornItem, WornMonthData } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: WornMonthData };

/** Shift a `YYYY-MM` string by whole months, wrapping the year. */
function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, monthIndex, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Render a `YYYY-MM` as a display label, e.g. "July 2026". */
function monthLabelOf(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The `/worn` screen: a quiet utility view of what got worn, month by month. Up
 * top, the screenshot-shareable "your month, worn" recap; below it, the month
 * calendar. Prev/next step through months (next stops at the current one — you
 * can't wear in the future); each change refetches `GET /api/wear-logs?month=`
 * and rebuilds the recap client-side via `@era/core`. The whole surface is
 * token-driven, so it reads cleanly in light and dark. Copy is Quill's
 * `strings.wear`.
 */
export function WornScreen() {
  const reduced = useReducedMotion();
  const [month, setMonth] = useState<string>(localMonthToday);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const res = await fetch(`/api/wear-logs?month=${month}`);
        if (!res.ok) throw new Error('wear-logs fetch failed');
        const data = (await res.json()) as WornMonthData;
        if (active) setState({ status: 'ready', data });
      } catch {
        if (active) setState({ status: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, [month]);

  const data = state.status === 'ready' ? state.data : null;

  const itemsById = useMemo<ReadonlyMap<string, WornItem>>(
    () => new Map((data?.items ?? []).map((item) => [item.id, item])),
    [data],
  );

  // The recap engine reads id/category/purchasePrice only; drop the nullable
  // imageUrl so the item shape matches `RecapItemLike` (imageUrl?: string).
  const recap = useMemo(
    () =>
      buildMonthlyRecap(
        data?.logs ?? [],
        (data?.items ?? []).map(({ id, name, category, purchasePrice }) => ({
          id,
          name,
          category,
          purchasePrice,
        })),
        month,
      ),
    [data, month],
  );

  const monthLabel = monthLabelOf(month);
  const atCurrentMonth = month >= localMonthToday();

  return (
    <Container>
      <main style={screenStyle}>
        <header style={headerStyle}>
          <Link href="/closet" aria-label="Back to Closet" style={backStyle}>
            <Text variant="ui" size="subhead" weight={600} as="span" style={{ color: 'var(--color-secondary-strong)' }}>
              <span aria-hidden="true">←</span>
              {' '}Closet
            </Text>
          </Link>

          <div style={monthNavStyle}>
            <motion.button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
              style={navButtonStyle}
              {...pressProps(reduced)}
            >
              <span aria-hidden="true">←</span>
            </motion.button>
            <Text variant="largeTitle" size="title1" weight={700} as="h1" aria-live="polite" style={{ margin: 0, color: 'var(--color-text)', textAlign: 'center', flex: 1 }}>
              {monthLabel}
            </Text>
            <motion.button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
              disabled={atCurrentMonth}
              style={{ ...navButtonStyle, opacity: atCurrentMonth ? 0.35 : 1, cursor: atCurrentMonth ? 'not-allowed' : 'pointer' }}
              {...pressProps(reduced, !atCurrentMonth)}
            >
              <span aria-hidden="true">→</span>
            </motion.button>
          </div>
        </header>

        {state.status === 'error' ? (
          <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
            {strings.errors.generic}
          </Text>
        ) : state.status === 'loading' ? (
          <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
            {strings.wear.calendar.title}…
          </Text>
        ) : (
          <>
            <MonthlyRecapCard recap={recap} itemsById={itemsById} monthLabel={monthLabel} />
            <WearCalendar month={month} logs={state.data.logs} itemsById={itemsById} />
          </>
        )}
      </main>
    </Container>
  );
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
  maxWidth: 'var(--feed-col)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const backStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  alignSelf: 'flex-start',
  minHeight: 'var(--touch-target-min)',
  textDecoration: 'none',
};

const monthNavStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const navButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--touch-target-min)',
  height: 'var(--touch-target-min)',
  flexShrink: 0,
  borderRadius: 'var(--radius-chip)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 'var(--text-body)',
  cursor: 'pointer',
};
