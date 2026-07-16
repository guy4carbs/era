/**
 * Unit tests for the Gemini image stage — global fetch is mocked, no network.
 * Covers the dormant/placeholder guards, the camelCase + snake_case inline-image
 * parse, and the never-throw failure paths (non-200, missing image, thrown fetch).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/gemini-image.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateAngleRender, isGeminiConfigured } from './gemini-image.ts';

const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;

function restore(): void {
  globalThis.fetch = realFetch;
  if (realKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = realKey;
  }
}

/** A fetch that fails the test if it is ever called (asserts the dormant short-circuit). */
function forbiddenFetch(): typeof globalThis.fetch {
  return (() => {
    throw new Error('fetch must not be called when the key is a placeholder');
  }) as unknown as typeof globalThis.fetch;
}

/** A fetch returning a canned generateContent response. */
function fetchReturning(response: { ok: boolean; status: number; body: unknown }): typeof globalThis.fetch {
  return (async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  })) as unknown as typeof globalThis.fetch;
}

test('isGeminiConfigured is false for unset and placeholder keys, true for a real one', () => {
  try {
    delete process.env.GEMINI_API_KEY;
    assert.equal(isGeminiConfigured(), false, 'unset → dormant');

    process.env.GEMINI_API_KEY = 'change-me-your-gemini-key';
    assert.equal(isGeminiConfigured(), false, 'change-me placeholder → dormant');

    process.env.GEMINI_API_KEY = 'AIzaSy-real-looking-key';
    assert.equal(isGeminiConfigured(), true, 'a real key → configured');
  } finally {
    restore();
  }
});

test('generateAngleRender returns null (and skips the network) when dormant', async () => {
  try {
    delete process.env.GEMINI_API_KEY;
    globalThis.fetch = forbiddenFetch();
    assert.equal(await generateAngleRender(new Uint8Array([1]), 'prompt'), null);

    process.env.GEMINI_API_KEY = 'change-me';
    assert.equal(await generateAngleRender(new Uint8Array([1]), 'prompt'), null);
  } finally {
    restore();
  }
});

test('generateAngleRender base64-decodes the camelCase inlineData image part', async () => {
  try {
    process.env.GEMINI_API_KEY = 'real-key';
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const data = Buffer.from(png).toString('base64');
    globalThis.fetch = fetchReturning({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }] },
    });
    assert.deepEqual(await generateAngleRender(new Uint8Array([9]), 'prompt'), png);
  } finally {
    restore();
  }
});

test('generateAngleRender also accepts the snake_case inline_data casing', async () => {
  try {
    process.env.GEMINI_API_KEY = 'real-key';
    const png = new Uint8Array([10, 20, 30]);
    const data = Buffer.from(png).toString('base64');
    globalThis.fetch = fetchReturning({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: 'here' }, { inline_data: { data } }] } }] },
    });
    assert.deepEqual(await generateAngleRender(new Uint8Array([9]), 'prompt'), png);
  } finally {
    restore();
  }
});

test('generateAngleRender returns null on a non-200 response', async () => {
  try {
    process.env.GEMINI_API_KEY = 'real-key';
    globalThis.fetch = fetchReturning({ ok: false, status: 500, body: {} });
    assert.equal(await generateAngleRender(new Uint8Array([9]), 'prompt'), null);
  } finally {
    restore();
  }
});

test('generateAngleRender returns null when the response carries no image part', async () => {
  try {
    process.env.GEMINI_API_KEY = 'real-key';
    globalThis.fetch = fetchReturning({
      ok: true,
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: 'no image here' }] } }] },
    });
    assert.equal(await generateAngleRender(new Uint8Array([9]), 'prompt'), null);
  } finally {
    restore();
  }
});

test('generateAngleRender swallows a thrown fetch and returns null', async () => {
  try {
    process.env.GEMINI_API_KEY = 'real-key';
    globalThis.fetch = (async () => {
      throw new Error('boom');
    }) as unknown as typeof globalThis.fetch;
    assert.equal(await generateAngleRender(new Uint8Array([9]), 'prompt'), null);
  } finally {
    restore();
  }
});
