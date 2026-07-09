/**
 * Unit tests for flat-lay segmentation.
 *
 * No live Anthropic call is made: `messages.create` is injected as a stub that
 * returns a canned tool response (or throws), and the credential source is
 * injected too, so the full contract is exercised without a real key or network:
 *   - validation: clamping, sliver/whole-image rejection, >12 cap by area,
 *     malformed / non-finite drops, none-survive → null
 *   - dormancy: no key / placeholder key → null, and the model is never called
 *   - unsupported media type → null, model never called
 *   - a thrown call (timeout/network/error) → null, message logged class-only
 *   - happy path: a faked tool response maps to normalized boxes
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/flatlay-segment.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { segmentFlatLay, type SegmentMessageCreate, type SegmentOptions } from './flatlay-segment.ts';

const REAL_KEY = 'sk-ant-realkey123';
const IMAGE = new Uint8Array([1, 2, 3, 4]);
const JPEG = 'image/jpeg';

/** Build a fake `messages.create` that returns one tool_use block with `input`. */
function stubCreate(input: unknown): { createMessage: SegmentMessageCreate; calls: number } {
  const state = { calls: 0 };
  const createMessage: SegmentMessageCreate = () => {
    state.calls += 1;
    return Promise.resolve({
      content: [{ type: 'tool_use', id: 'tu_1', name: 'report_items', input }],
    } as unknown as Awaited<ReturnType<SegmentMessageCreate>>);
  };
  return { createMessage, get calls() { return state.calls; } };
}

/** A create stub that always throws — models a timeout / network / API error. */
function throwingCreate(error: unknown): { createMessage: SegmentMessageCreate; calls: number } {
  const state = { calls: 0 };
  const createMessage: SegmentMessageCreate = () => {
    state.calls += 1;
    return Promise.reject(error);
  };
  return { createMessage, get calls() { return state.calls; } };
}

/** A create stub that must never run; fails the test if the model is called. */
const neverCreate: SegmentMessageCreate = () => {
  throw new Error('model must not be called');
};

/** Options with a real key and an injected create, silencing the error log. */
function opts(createMessage: SegmentMessageCreate, extra: Partial<SegmentOptions> = {}): SegmentOptions {
  return { env: { ANTHROPIC_API_KEY: REAL_KEY }, createMessage, log: () => {}, ...extra };
}

test('happy path: faked tool response maps to normalized boxes', async () => {
  const stub = stubCreate({
    items: [
      { x: 0.1, y: 0.1, w: 0.3, h: 0.4, label: 'black denim jacket' },
      { x: 0.5, y: 0.5, w: 0.2, h: 0.25, label: 'white sneaker' },
    ],
  });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.equal(stub.calls, 1);
  assert.deepEqual(boxes, [
    { x: 0.1, y: 0.1, width: 0.3, height: 0.4, label: 'black denim jacket' },
    { x: 0.5, y: 0.5, width: 0.2, height: 0.25, label: 'white sneaker' },
  ]);
});

test('clamps out-of-range coordinates into [0, 1]', async () => {
  // x,y clamp to 0/1; a w/h > 1 clamps to 1 and is then rejected as whole-image,
  // so use a mid-range w/h and push only x,y out of bounds.
  const stub = stubCreate({ items: [{ x: -0.5, y: 1.4, w: 0.3, h: 0.3, label: 'scarf' }] });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.deepEqual(boxes, [{ x: 0, y: 1, width: 0.3, height: 0.3, label: 'scarf' }]);
});

test('rejects sliver boxes (side <= 0.02)', async () => {
  const stub = stubCreate({
    items: [
      { x: 0.1, y: 0.1, w: 0.01, h: 0.5, label: 'sliver-width' },
      { x: 0.2, y: 0.2, w: 0.5, h: 0.02, label: 'sliver-height' },
      { x: 0.3, y: 0.3, w: 0.3, h: 0.3, label: 'keeper' },
    ],
  });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.deepEqual(boxes, [{ x: 0.3, y: 0.3, width: 0.3, height: 0.3, label: 'keeper' }]);
});

test('rejects whole-image boxes (side >= 0.98)', async () => {
  const stub = stubCreate({
    items: [
      { x: 0, y: 0, w: 0.99, h: 0.5, label: 'full-width' },
      { x: 0, y: 0, w: 0.5, h: 1, label: 'full-height' },
      { x: 0.3, y: 0.3, w: 0.3, h: 0.3, label: 'keeper' },
    ],
  });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.deepEqual(boxes, [{ x: 0.3, y: 0.3, width: 0.3, height: 0.3, label: 'keeper' }]);
});

test('drops malformed and non-finite entries', async () => {
  const stub = stubCreate({
    items: [
      null,
      'nope',
      { x: 0.1, y: 0.1, w: 0.3 }, // missing h
      { x: Number.NaN, y: 0.1, w: 0.3, h: 0.3, label: 'nan-x' },
      { x: 0.1, y: 0.1, w: Number.POSITIVE_INFINITY, h: 0.3, label: 'inf-w' },
      { x: 0.4, y: 0.4, w: 0.3, h: 0.3, label: 'good' },
    ],
  });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.deepEqual(boxes, [{ x: 0.4, y: 0.4, width: 0.3, height: 0.3, label: 'good' }]);
});

test('missing/empty label falls back to a placeholder', async () => {
  const stub = stubCreate({
    items: [
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, // no label
      { x: 0.5, y: 0.5, w: 0.3, h: 0.3, label: '   ' }, // whitespace only
    ],
  });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.equal(boxes?.length, 2);
  assert.equal(boxes?.[0]?.label, 'item');
  assert.equal(boxes?.[1]?.label, 'item');
});

test('caps at 12 boxes, keeping the largest by area', async () => {
  // 14 valid boxes with increasing area; the two smallest must be dropped.
  const items = Array.from({ length: 14 }, (_, i) => {
    const side = 0.05 + i * 0.03; // 0.05 .. 0.44, all within (0.02, 0.98)
    return { x: 0, y: 0, w: side, h: side, label: `box-${i}` };
  });
  const stub = stubCreate({ items });
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage));

  assert.equal(boxes?.length, 12);
  const labels = new Set(boxes?.map((b) => b.label));
  assert.ok(!labels.has('box-0'), 'smallest box dropped');
  assert.ok(!labels.has('box-1'), 'second-smallest box dropped');
  assert.ok(labels.has('box-13'), 'largest box kept');
});

test('no surviving boxes → null', async () => {
  const stub = stubCreate({ items: [{ x: 0.1, y: 0.1, w: 0.01, h: 0.01, label: 'sliver' }] });
  assert.equal(await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage)), null);
});

test('empty / non-array items → null', async () => {
  assert.equal(await segmentFlatLay(IMAGE, JPEG, opts(stubCreate({ items: [] }).createMessage)), null);
  assert.equal(await segmentFlatLay(IMAGE, JPEG, opts(stubCreate({ items: 'nope' }).createMessage)), null);
  assert.equal(await segmentFlatLay(IMAGE, JPEG, opts(stubCreate({}).createMessage)), null);
});

test('no tool_use block in the response → null', async () => {
  const createMessage: SegmentMessageCreate = () =>
    Promise.resolve({ content: [{ type: 'text', text: 'sorry' }] } as unknown as Awaited<ReturnType<SegmentMessageCreate>>);
  assert.equal(await segmentFlatLay(IMAGE, JPEG, opts(createMessage)), null);
});

test('dormant: no key → null and the model is never called', async () => {
  const boxes = await segmentFlatLay(IMAGE, JPEG, { env: {}, createMessage: neverCreate, log: () => {} });
  assert.equal(boxes, null);
});

test('dormant: placeholder keys are treated as absent', async () => {
  for (const key of ['change-me-anthropic-key', 'sk-ant-xxxx-placeholder']) {
    const boxes = await segmentFlatLay(IMAGE, JPEG, { env: { ANTHROPIC_API_KEY: key }, createMessage: neverCreate, log: () => {} });
    assert.equal(boxes, null, `placeholder ${key} must stay dormant`);
  }
});

test('unsupported media type → null, model never called', async () => {
  const stub = stubCreate({ items: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3, label: 'x' }] });
  const boxes = await segmentFlatLay(IMAGE, 'image/avif', opts(stub.createMessage));
  assert.equal(boxes, null);
  assert.equal(stub.calls, 0);
});

test('a thrown call (timeout/network/error) → null, logged class-only', async () => {
  const stub = throwingCreate(new (class TimeoutError extends Error {})('boom secret detail'));
  const logs: string[] = [];
  const boxes = await segmentFlatLay(IMAGE, JPEG, opts(stub.createMessage, { log: (m) => logs.push(m) }));

  assert.equal(boxes, null);
  assert.equal(stub.calls, 1);
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /TimeoutError/);
  assert.ok(!logs[0]!.includes('boom secret detail'), 'error message must not be logged');
});
