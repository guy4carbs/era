import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aiDailyLimit, estimateCostUsd } from './ai-limits.ts';

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
