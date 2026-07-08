import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localDateOf, localMonthToday, localToday } from './local-date.ts';

test('localDateOf reads the local calendar day, zero-padded', () => {
  // `new Date(y, mIndex, d, ...)` builds a LOCAL date, so the local getters are
  // fixed regardless of the runner's timezone. January is month index 0.
  assert.equal(localDateOf(new Date(2026, 0, 5, 9, 15)), '2026-01-05');
  assert.equal(localDateOf(new Date(2026, 6, 7, 19, 30)), '2026-07-07');
  assert.equal(localDateOf(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('localDateOf keeps an evening log on the same local day (the UTC-rollover bug)', () => {
  // 2026-07-07 19:30 local. `toISOString()` would roll this to 2026-07-08 for
  // any timezone west of UTC; the local getters must not.
  assert.equal(localDateOf(new Date(2026, 6, 7, 19, 30)), '2026-07-07');
});

test('localToday / localMonthToday read the mocked local date', () => {
  const RealDate = Date;
  // A fixed LOCAL instant (2026-07-07 19:30) — its local getters are stable
  // regardless of the runner's timezone. `new Date()` returns exactly this.
  const fixed = new RealDate(2026, 6, 7, 19, 30, 0);
  class FakeDate extends RealDate {
    constructor() {
      super();
      return fixed;
    }
  }
  globalThis.Date = FakeDate as unknown as DateConstructor;
  try {
    assert.equal(localToday(), '2026-07-07');
    assert.equal(localMonthToday(), '2026-07');
  } finally {
    globalThis.Date = RealDate;
  }
});
