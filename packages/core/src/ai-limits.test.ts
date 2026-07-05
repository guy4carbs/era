import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aiDailyLimit,
  estimateCostUsd,
  aiKillSwitchEngaged,
  aiGlobalDailyUsdCap,
  globalSpendAllows,
  readGlobalAiGate,
} from './ai-limits.ts';

test('aiDailyLimit returns sane defaults when no override is set', () => {
  assert.equal(aiDailyLimit('ovi-chat', {}), 50);
  assert.equal(aiDailyLimit('process-item', {}), 100);
  assert.equal(aiDailyLimit('derive-style-profile', {}), 20);
  assert.equal(aiDailyLimit('rank-products', {}), 30);
});

test('aiDailyLimit honours a valid numeric env override', () => {
  assert.equal(aiDailyLimit('ovi-chat', { OVI_CHAT_DAILY_LIMIT: '25' }), 25);
  assert.equal(aiDailyLimit('process-item', { PROCESS_ITEM_DAILY_LIMIT: '200' }), 200);
  assert.equal(aiDailyLimit('rank-products', { RANK_PRODUCTS_DAILY_LIMIT: '15' }), 15);
});

test('aiDailyLimit ignores non-numeric / non-positive overrides and falls back', () => {
  assert.equal(aiDailyLimit('ovi-chat', { OVI_CHAT_DAILY_LIMIT: 'lots' }), 50);
  assert.equal(aiDailyLimit('ovi-chat', { OVI_CHAT_DAILY_LIMIT: '' }), 50);
  assert.equal(aiDailyLimit('ovi-chat', { OVI_CHAT_DAILY_LIMIT: '0' }), 50);
  assert.equal(aiDailyLimit('ovi-chat', { OVI_CHAT_DAILY_LIMIT: '-5' }), 50);
});

test('aiDailyLimit floors fractional overrides', () => {
  assert.equal(aiDailyLimit('derive-style-profile', { DERIVE_PROFILE_DAILY_LIMIT: '19.9' }), 19);
});

test('estimateCostUsd prices a known model by token counts', () => {
  // Opus 4.8: $5/1M in, $25/1M out. 1M in + 1M out = $30.
  assert.equal(estimateCostUsd('claude-opus-4-8', 1_000_000, 1_000_000), 30);
  // 1000 in + 500 out on Opus 4.8 = 0.005 + 0.0125 = 0.0175.
  assert.equal(estimateCostUsd('claude-opus-4-8', 1000, 500), 0.0175);
});

test('estimateCostUsd is case-insensitive on the model id', () => {
  assert.equal(estimateCostUsd('CLAUDE-OPUS-4-8', 1_000_000, 0), 5);
});

test('estimateCostUsd returns 0 for null model, absent tokens, or unknown model', () => {
  assert.equal(estimateCostUsd(null, 1000, 1000), 0);
  assert.equal(estimateCostUsd('claude-opus-4-8'), 0);
  assert.equal(estimateCostUsd('claude-opus-4-8', 0, 0), 0);
  assert.equal(estimateCostUsd('some-vision-model', 1000, 1000), 0);
});

// --- global kill-switch ------------------------------------------------------

test('aiKillSwitchEngaged is OFF by default and for non-on values', () => {
  assert.equal(aiKillSwitchEngaged({}), false);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: '0' }), false);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: 'false' }), false);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: 'off' }), false);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: '' }), false);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: 'maybe' }), false);
});

test('aiKillSwitchEngaged is ON for truthy on-values, any case, trimmed', () => {
  for (const on of ['1', 'true', 'on', 'yes']) {
    assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: on }), true, on);
  }
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: 'TRUE' }), true);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: 'On' }), true);
  assert.equal(aiKillSwitchEngaged({ AI_KILL_SWITCH: '  yes  ' }), true);
});

// --- global daily USD cap ----------------------------------------------------

test('aiGlobalDailyUsdCap parses a positive finite amount (not floored)', () => {
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: '250' }), 250);
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: '12.5' }), 12.5);
});

test('aiGlobalDailyUsdCap is null when unset, invalid, or non-positive', () => {
  assert.equal(aiGlobalDailyUsdCap({}), null);
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: '' }), null);
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: 'lots' }), null);
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: '0' }), null);
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: '-10' }), null);
  assert.equal(aiGlobalDailyUsdCap({ AI_GLOBAL_DAILY_USD: 'Infinity' }), null);
});

// --- global spend decision ---------------------------------------------------

test('globalSpendAllows is always true when no cap is set', () => {
  assert.equal(globalSpendAllows(0, {}), true);
  assert.equal(globalSpendAllows(1_000_000, {}), true);
});

test('globalSpendAllows blocks at and above the cap (== cap is blocked)', () => {
  const env = { AI_GLOBAL_DAILY_USD: '100' };
  assert.equal(globalSpendAllows(99.99, env), true);
  assert.equal(globalSpendAllows(100, env), false, 'exactly the cap must be blocked');
  assert.equal(globalSpendAllows(100.01, env), false);
});

test('globalSpendAllows treats a non-finite spend as 0', () => {
  const env = { AI_GLOBAL_DAILY_USD: '100' };
  assert.equal(globalSpendAllows(Number.NaN, env), true);
  assert.equal(globalSpendAllows(Number.POSITIVE_INFINITY, env), true);
});

test('readGlobalAiGate snapshots both controls in one read', () => {
  assert.deepEqual(readGlobalAiGate({}), { killed: false, capUsd: null });
  assert.deepEqual(readGlobalAiGate({ AI_KILL_SWITCH: 'yes', AI_GLOBAL_DAILY_USD: '75' }), {
    killed: true,
    capUsd: 75,
  });
});
