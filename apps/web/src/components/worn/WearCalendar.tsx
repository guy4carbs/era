'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { groupWearsByDay, type WearLogLike } from '@era/core/wear-stats';
import { transitionFor } from '../../lib/motion';
import { localToday } from '../../lib/local-date';
import { Text } from '../Text';
import type { WornItem, WornLog } from './types';

export interface WearCalendarProps {
  /** The viewed month as `YYYY-MM`. */
  month: string;
  /** The month's wear logs (owner-scoped, from `GET /api/wear-logs`). */
  logs: WornLog[];
  /** Owned pieces referenced by the logs, for resolving day thumbnails. */
  itemsById: ReadonlyMap<string, WornItem>;
}

// Sunday-start week (US convention — the user is Chicago-based). Letters are
// decorative; the tappable day cells carry the screen-reader labels.
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MAX_DAY_THUMBS = 3;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Resolve a day's `itemIds` (deduped, in first-seen order) to owned pieces. */
function resolveDayItems(logs: readonly WearLogLike[], itemsById: ReadonlyMap<string, WornItem>): WornItem[] {
  const seen = new Set<string>();
  const out: WornItem[] = [];
  for (const log of logs) {
    for (const id of log.itemIds ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const item = itemsById.get(id);
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * A quiet month grid of what got worn. Each day with a wear shows a small
 * thumbnail stack (or a dot when the wear was an outfit with no loose items);
 * tapping a day reveals that day's pieces in a panel below the grid. Weeks start
 * Sunday; the current day carries a subtle ring. Deliberately restrained — this
 * is a utility view, not a dashboard. An empty month shows the invite line and a
 * blank grid. Copy is Quill's `strings.wear.calendar`; motion collapses under
 * reduced-motion.
 */
export function WearCalendar({ month, logs, itemsById }: WearCalendarProps) {
  const reduced = useReducedMotion();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => groupWearsByDay(logs), [logs]);

  const { year, monthIndex } = useMemo(() => {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    return { year: y, monthIndex: m - 1 };
  }, [month]);

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  // The today-ring keys off the LOCAL date (matches the wornOn a log writes),
  // not UTC — same Gauge TZ fix as logWear. See lib/local-date.
  const today = localToday();

  // Selected day resolves to its pieces + a long-form heading for the panel.
  const selected = useMemo(() => {
    if (!selectedDay) return null;
    const dayLogs = byDay.get(selectedDay) ?? [];
    const [y, m, d] = selectedDay.split('-').map(Number);
    const longDate = new Date(Date.UTC(y ?? year, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return { count: dayLogs.length, items: resolveDayItems(dayLogs, itemsById), longDate };
  }, [selectedDay, byDay, itemsById, year]);

  const isEmpty = logs.length === 0;

  return (
    <section style={sectionStyle} aria-label={strings.wear.calendar.title}>
      <Text variant="title" size="title3" weight={700} as="h2" style={{ margin: 0, color: 'var(--color-text)' }}>
        {strings.wear.calendar.title}
      </Text>

      {isEmpty ? (
        <Text variant="body" size="subhead" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
          {strings.wear.calendar.emptyMonth}
        </Text>
      ) : null}

      <div role="row" style={weekdayRowStyle} aria-hidden="true">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text
            key={index}
            variant="caption"
            weight={700}
            as="span"
            style={{ textAlign: 'center', color: 'var(--color-secondary-strong)' }}
          >
            {letter}
          </Text>
        ))}
      </div>

      <div style={gridStyle}>
        {/* Leading blanks so day 1 lands under its weekday column. */}
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateStr = `${month}-${pad2(day)}`;
          const dayLogs = byDay.get(dateStr) ?? [];
          const count = dayLogs.length;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDay;

          if (count === 0) {
            return (
              <span
                key={dateStr}
                style={{ ...emptyCellStyle, ...(isToday ? todayRingStyle : null) }}
              >
                {day}
              </span>
            );
          }

          const thumbs = resolveDayItems(dayLogs, itemsById)
            .filter((item) => item.imageUrl)
            .slice(0, MAX_DAY_THUMBS);

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => setSelectedDay((prev) => (prev === dateStr ? null : dateStr))}
              aria-pressed={isSelected}
              aria-label={`${day}, ${strings.wear.calendar.dayA11y(count)}`}
              style={{
                ...wearCellStyle,
                ...(isToday ? todayRingStyle : null),
                ...(isSelected ? selectedCellStyle : null),
              }}
            >
              <Text variant="caption" weight={600} as="span" style={dayNumberStyle}>
                {day}
              </Text>
              {thumbs.length > 0 ? (
                <span style={thumbStackStyle} aria-hidden="true">
                  {thumbs.map((item) => (
                    <span key={item.id} style={thumbDotStyle}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" style={thumbImageStyle} />
                      ) : null}
                    </span>
                  ))}
                </span>
              ) : (
                <span style={plainDotStyle} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected ? (
          <motion.div
            key={selectedDay}
            style={panelStyle}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
          >
            <div style={panelHeaderStyle}>
              <Text variant="ui" size="subhead" weight={700} as="span" style={{ color: 'var(--color-text)' }}>
                {selected.longDate}
              </Text>
              <Text variant="caption" size="footnote" as="span" style={{ color: 'var(--color-secondary-strong)' }}>
                {strings.wear.calendar.dayA11y(selected.count)}
              </Text>
            </div>
            {selected.items.length > 0 ? (
              <ul style={panelItemsStyle}>
                {selected.items.map((item) => (
                  <li key={item.id} style={panelItemStyle}>
                    <span style={panelThumbStyle}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} style={thumbImageStyle} />
                      ) : null}
                    </span>
                    <Text
                      variant="caption"
                      as="span"
                      style={{ color: 'var(--color-secondary-strong)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
                    >
                      {item.name}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const weekdayRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 'var(--space-1)',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 'var(--space-1)',
};

// Base square cell shared by empty and wear days.
const cellBase: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  aspectRatio: '1 / 1',
  borderRadius: 'var(--radius-chip)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
};

const emptyCellStyle: CSSProperties = {
  ...cellBase,
  color: 'var(--color-secondary-strong)',
};

const wearCellStyle: CSSProperties = {
  ...cellBase,
  padding: 'var(--space-1)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  font: 'inherit',
};

const selectedCellStyle: CSSProperties = {
  borderColor: 'var(--color-accent)',
  boxShadow: '0 0 0 1px var(--color-accent)',
};

const todayRingStyle: CSSProperties = {
  outline: '1px solid var(--color-accent)',
  outlineOffset: '1px',
};

const dayNumberStyle: CSSProperties = {
  lineHeight: `${typeRamp.caption.lineHeight}px`,
};

const thumbStackStyle: CSSProperties = {
  display: 'flex',
  gap: '2px',
};

const thumbDotStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--space-4)',
  height: 'var(--space-4)',
  borderRadius: 'var(--radius-chip)',
  overflow: 'hidden',
  background: 'var(--color-bg)',
};

const thumbImageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const plainDotStyle: CSSProperties = {
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: '50%',
  background: 'var(--color-accent)',
};

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
};

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const panelItemsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const panelItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  width: 'var(--space-16)',
};

const panelThumbStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--space-16)',
  height: 'var(--space-16)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-hairline)',
};
