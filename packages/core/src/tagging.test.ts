/**
 * Unit tests for the tagger seam (tagging.ts).
 *
 * The deterministic fixture is the $0 test vehicle and the honest current-behavior
 * stand-in, so the facts asserted here are: it names itself, it always returns the fixed
 * placeholder, and that placeholder matches the pipeline's dormant-vision shape.
 *
 * Run: node --experimental-strip-types --test src/tagging.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeterministicTaggingProvider,
  type TaggingInput,
  type TagPrediction,
} from './tagging.ts';

const provider = createDeterministicTaggingProvider();

test('the provider names itself so a swap is observable on telemetry', () => {
  assert.equal(provider.name, 'deterministic');
});

test('it returns the fixed placeholder: category "top", every other field null', async () => {
  const prediction = await provider.classify({ imageBytesBase64: 'abc', mediaType: 'image/png' });
  assert.notEqual(prediction, null);
  const p = prediction as TagPrediction;
  assert.equal(p.category, 'top');
  assert.equal(p.name, null);
  assert.equal(p.brand, null);
  assert.equal(p.colorPrimary, null);
  assert.equal(p.colors, null);
  assert.equal(p.pattern, null);
});

test('it never abstains — the same placeholder regardless of input', async () => {
  const inputs: TaggingInput[] = [
    {},
    { filenameHint: 'shirt.jpg' },
    { imageBytesBase64: 'zzz', mediaType: 'image/jpeg' },
  ];
  for (const input of inputs) {
    const prediction = await provider.classify(input);
    assert.notEqual(prediction, null, 'fixture never abstains');
    assert.equal((prediction as TagPrediction).category, 'top');
  }
});

test('the prediction is stable across calls (deterministic)', async () => {
  const a = await provider.classify({});
  const b = await provider.classify({});
  assert.deepEqual(a, b);
});
