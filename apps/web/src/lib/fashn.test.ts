/**
 * Unit tests for the FASHN client — global fetch is mocked, no network. Covers the
 * dormant/placeholder guard, the submit→poll→download happy path for both
 * model-create and try-on, the never-throw failure paths (submit non-200, status
 * `failed`, empty output), and that the deletion seam is a resolving no-op.
 *
 * The poll loop only sleeps BETWEEN non-terminal polls, so every mock here returns
 * a terminal status on the first poll — the tests never wait on a real timer.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/fashn.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFashnModel, deleteFashnModel, isFashnConfigured, runTryon } from './fashn.ts';

const realFetch = globalThis.fetch;
const realKey = process.env.FASHN_API_KEY;

function restore(): void {
  globalThis.fetch = realFetch;
  if (realKey === undefined) {
    delete process.env.FASHN_API_KEY;
  } else {
    process.env.FASHN_API_KEY = realKey;
  }
}

/** A fetch that fails the test if it is ever called (asserts the dormant short-circuit). */
function forbiddenFetch(): typeof globalThis.fetch {
  return (() => {
    throw new Error('fetch must not be called when the key is a placeholder');
  }) as unknown as typeof globalThis.fetch;
}

interface CannedHttp {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

/**
 * Route the three FASHN call shapes: `POST /v1/run`, `GET /v1/status/{id}`, and a
 * CDN image download (any other URL). `image` is the bytes the download resolves to.
 */
function mockFashn(opts: { run: CannedHttp; status: CannedHttp; image?: Uint8Array }): typeof globalThis.fetch {
  return (async (url: unknown) => {
    const u = String(url);
    if (u.endsWith('/v1/run')) {
      return { ok: opts.run.ok, status: opts.run.status, json: async () => opts.run.body };
    }
    if (u.includes('/v1/status/')) {
      return { ok: opts.status.ok, status: opts.status.status, json: async () => opts.status.body };
    }
    const bytes = opts.image ?? new Uint8Array([1, 2, 3]);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }) as unknown as typeof globalThis.fetch;
}

test('isFashnConfigured is false for unset and placeholder keys, true for a real one', () => {
  try {
    delete process.env.FASHN_API_KEY;
    assert.equal(isFashnConfigured(), false, 'unset → dormant');
    process.env.FASHN_API_KEY = 'change-me-your-fashn-key';
    assert.equal(isFashnConfigured(), false, 'change-me placeholder → dormant');
    process.env.FASHN_API_KEY = 'fa-real-looking-key';
    assert.equal(isFashnConfigured(), true, 'a real key → configured');
  } finally {
    restore();
  }
});

test('createFashnModel and runTryon skip the network and return null when dormant', async () => {
  try {
    delete process.env.FASHN_API_KEY;
    globalThis.fetch = forbiddenFetch();
    assert.equal(await createFashnModel(['https://x/1.png']), null);
    assert.equal(await runTryon('https://x/p.png', 'https://x/g.png', 'top'), null);
  } finally {
    restore();
  }
});

test('createFashnModel returns bytes + the prediction id on the happy path', async () => {
  try {
    process.env.FASHN_API_KEY = 'real-key';
    const png = new Uint8Array([137, 80, 78, 71, 9, 9]);
    globalThis.fetch = mockFashn({
      run: { ok: true, status: 200, body: { id: 'pred-1', error: null } },
      status: { ok: true, status: 200, body: { id: 'pred-1', status: 'completed', output: ['https://cdn.fashn.ai/m.png'], error: null } },
      image: png,
    });
    const result = await createFashnModel(['https://x/1.png', 'https://x/2.png']);
    assert.ok(result, 'a result is returned');
    assert.deepEqual(result.modelImageBytes, png);
    assert.equal(result.vendorModelId, 'pred-1');
  } finally {
    restore();
  }
});

test('createFashnModel returns null when the source list is empty (no network)', async () => {
  try {
    process.env.FASHN_API_KEY = 'real-key';
    globalThis.fetch = forbiddenFetch();
    assert.equal(await createFashnModel([]), null);
  } finally {
    restore();
  }
});

test('createFashnModel returns null when /run does not return an id', async () => {
  try {
    process.env.FASHN_API_KEY = 'real-key';
    globalThis.fetch = mockFashn({
      run: { ok: false, status: 500, body: {} },
      status: { ok: true, status: 200, body: {} },
    });
    assert.equal(await createFashnModel(['https://x/1.png']), null);
  } finally {
    restore();
  }
});

test('runTryon returns the rendered bytes on the happy path', async () => {
  try {
    process.env.FASHN_API_KEY = 'real-key';
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    globalThis.fetch = mockFashn({
      run: { ok: true, status: 200, body: { id: 'pred-9' } },
      status: { ok: true, status: 200, body: { status: 'completed', output: ['https://cdn.fashn.ai/o.png'] } },
      image: png,
    });
    assert.deepEqual(await runTryon('https://x/p.png', 'https://x/g.png', 'dress'), png);
  } finally {
    restore();
  }
});

test('runTryon returns null on a failed prediction', async () => {
  try {
    process.env.FASHN_API_KEY = 'real-key';
    globalThis.fetch = mockFashn({
      run: { ok: true, status: 200, body: { id: 'pred-2' } },
      status: { ok: true, status: 200, body: { status: 'failed', error: 'nsfw' } },
    });
    assert.equal(await runTryon('https://x/p.png', 'https://x/g.png', 'top'), null);
  } finally {
    restore();
  }
});

test('runTryon returns null when a completed prediction has no output URLs', async () => {
  try {
    process.env.FASHN_API_KEY = 'real-key';
    globalThis.fetch = mockFashn({
      run: { ok: true, status: 200, body: { id: 'pred-3' } },
      status: { ok: true, status: 200, body: { status: 'completed', output: [] } },
    });
    assert.equal(await runTryon('https://x/p.png', 'https://x/g.png', 'shoes'), null);
  } finally {
    restore();
  }
});

test('deleteFashnModel resolves without throwing (documented no-op seam)', async () => {
  await assert.doesNotReject(() => deleteFashnModel('pred-1'));
  await assert.doesNotReject(() => deleteFashnModel(null));
});
