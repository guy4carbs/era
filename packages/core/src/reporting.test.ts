import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDebugReporter, noopReporter, type CapturedReport } from './reporting.ts';

test('createDebugReporter captures a forced error with context', () => {
  const reporter = createDebugReporter(() => {});
  const boom = new Error('forced');

  reporter.captureError(boom, { route: 'ovi-chat' });

  const reports = reporter.getReports();
  assert.equal(reports.length, 1);
  const report = reports[0];
  assert.equal(report?.kind, 'error');
  if (report?.kind === 'error') {
    assert.equal(report.error, boom);
    assert.deepEqual(report.context, { route: 'ovi-chat' });
  }
});

test('createDebugReporter captures messages with a default level of info', () => {
  const reporter = createDebugReporter(() => {});

  reporter.captureMessage('cache warmed');
  reporter.captureMessage('degraded', 'warning');

  const reports = reporter.getReports();
  assert.equal(reports[0]?.kind, 'message');
  if (reports[0]?.kind === 'message') assert.equal(reports[0].level, 'info');
  if (reports[1]?.kind === 'message') assert.equal(reports[1].level, 'warning');
});

test('createDebugReporter forwards to the sink', () => {
  const sunk: CapturedReport[] = [];
  const reporter = createDebugReporter((r) => sunk.push(r));

  reporter.captureError(new Error('x'));

  assert.equal(sunk.length, 1);
  assert.equal(sunk[0]?.kind, 'error');
});

test('createDebugReporter never throws even when the sink throws', () => {
  const reporter = createDebugReporter(() => {
    throw new Error('tracker down');
  });

  assert.doesNotThrow(() => reporter.captureError(new Error('inner')));
  assert.equal(reporter.getReports().length, 1);
});

test('noopReporter does nothing and never throws', () => {
  assert.doesNotThrow(() => {
    noopReporter.captureError(new Error('ignored'));
    noopReporter.captureMessage('ignored', 'error');
  });
});
