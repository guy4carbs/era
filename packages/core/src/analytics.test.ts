import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDebugAnalytics, noopAnalytics, type CapturedEvent } from './analytics.ts';

test('createDebugAnalytics captures tracked funnel events in order', () => {
  const analytics = createDebugAnalytics(() => {});

  analytics.track('quiz_started');
  analytics.track('quiz_completed', { itemsSeen: 12, skipped: false });

  const events = analytics.getEvents();
  assert.equal(events.length, 2);
  assert.equal(events[0]?.event, 'quiz_started');
  assert.equal(events[1]?.event, 'quiz_completed');
  assert.deepEqual(events[1]?.props, { itemsSeen: 12, skipped: false });
});

test('createDebugAnalytics forwards each event to the sink', () => {
  const sunk: CapturedEvent[] = [];
  const analytics = createDebugAnalytics((e) => sunk.push(e));

  analytics.track('waitlist_signup');

  assert.equal(sunk.length, 1);
  assert.equal(sunk[0]?.event, 'waitlist_signup');
});

test('createDebugAnalytics records identify and reset', () => {
  const analytics = createDebugAnalytics(() => {});

  analytics.identify('user-123', { plan: 'free' });
  analytics.reset();

  const events = analytics.getEvents();
  assert.equal(events[0]?.event, 'identify');
  assert.deepEqual(events[0]?.props, { distinctId: 'user-123', plan: 'free' });
  assert.equal(events[1]?.event, 'reset');
});

test('createDebugAnalytics is fire-and-forget — a throwing sink never surfaces', () => {
  const analytics = createDebugAnalytics(() => {
    throw new Error('tracker down');
  });

  assert.doesNotThrow(() => analytics.track('ovi_message'));
  // The event is still captured in memory even though the sink threw.
  assert.equal(analytics.getEvents().length, 1);
});

test('noopAnalytics does nothing and never throws', () => {
  assert.doesNotThrow(() => {
    noopAnalytics.track('first_item_added', { source: 'photo' });
    noopAnalytics.identify('user-1');
    noopAnalytics.reset();
  });
});
