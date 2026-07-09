/**
 * Unit tests for bulk flat-lay capture orchestration.
 *
 * Fully hermetic: no sharp, no db, no Anthropic key, no route. Every side effect
 * (segment, imageSize, cropJpeg, storeCrop, runPipeline, meter) is an injected
 * fake, so the contract is exercised end to end:
 *   - pure helpers: hasBatchHeadroom, toPixelRect (clamp + degenerate)
 *   - dormant vs empty-model reasons, and that dormancy fires no call / no meter
 *   - out-of-bounds box (x+w>1) clamped to the image before cropping
 *   - per-item failure isolation (one crop fails → others land, failed count right)
 *   - metering: one per segmentation call + one per successful crop, none on failure
 *   - concurrency: never more than the bound in flight at once
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/flatlay-batch.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasBatchHeadroom, processBatchPipeline, toPixelRect, type BatchDeps, type PixelRect } from './flatlay-batch.ts';
import type { SegmentBox } from './flatlay-segment.ts';
import type { Item } from '@era/db';

const BYTES = new Uint8Array([1, 2, 3, 4]);
const JPEG = 'image/jpeg';

function box(over: Partial<SegmentBox> = {}): SegmentBox {
  return { x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: 'item', ...over };
}

/** A minimal Item stand-in; only id/name/category are read by the route. */
function fakeItem(id: string, name = 'New item'): Item {
  return { id, name, category: 'top' } as unknown as Item;
}

/**
 * Build deps with sensible fakes and spies. Overrides win. `calls` exposes the
 * counters/records the tests assert on.
 */
function makeDeps(over: Partial<BatchDeps> = {}) {
  const calls = {
    segment: 0,
    meter: 0,
    crops: [] as PixelRect[],
    stored: 0,
    pipelines: [] as string[],
  };
  const deps: BatchDeps = {
    segment: async () => {
      calls.segment += 1;
      return [box()];
    },
    imageSize: async () => ({ width: 1000, height: 800 }),
    cropJpeg: async (_bytes, rect) => {
      calls.crops.push(rect);
      return new Uint8Array([9]);
    },
    storeCrop: async () => {
      calls.stored += 1;
      return `u1/${calls.stored}.jpg`;
    },
    runPipeline: async ({ label }) => {
      calls.pipelines.push(label);
      return fakeItem(`i${calls.pipelines.length}`, label);
    },
    meter: async () => {
      calls.meter += 1;
    },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

// --- pure helpers -----------------------------------------------------------

test('hasBatchHeadroom needs room for segmentation + one item', () => {
  assert.equal(hasBatchHeadroom({ used: 98, limit: 100 }), true); // 2 free
  assert.equal(hasBatchHeadroom({ used: 99, limit: 100 }), false); // only 1 free
  assert.equal(hasBatchHeadroom({ used: 100, limit: 100 }), false); // none
  assert.equal(hasBatchHeadroom({ used: 0, limit: 1 }), false); // limit itself < 2
});

test('toPixelRect clamps an out-of-bounds box to image bounds', () => {
  // x=0.9 → left 900; width 0.5 → 500, but only 100px remain → clamped to 100.
  const rect = toPixelRect(box({ x: 0.9, y: 0.1, width: 0.5, height: 0.2 }), 1000, 800);
  assert.deepEqual(rect, { left: 900, top: 80, width: 100, height: 160 });
});

test('toPixelRect drops a rect that clamps below one pixel (degenerate)', () => {
  // left pinned to imgW-1 = 999, so at most 1px of width remains; a sub-pixel
  // width rounds to 0 and the box is dropped.
  assert.equal(toPixelRect(box({ x: 1, y: 0, width: 0.0001, height: 0.2 }), 1000, 800), null);
  assert.equal(toPixelRect(box(), 0, 0), null);
});

// --- reasons + dormancy -----------------------------------------------------

test('dormant segmentation returns segmentation_unavailable and fires nothing', async () => {
  const { deps, calls } = makeDeps();
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: false });

  assert.deepEqual(result, { items: [], failed: 0, reason: 'segmentation_unavailable' });
  assert.equal(calls.segment, 0);
  assert.equal(calls.meter, 0);
});

test('active segmentation that finds nothing returns no_items_found and meters the call', async () => {
  const { deps, calls } = makeDeps({ segment: async () => null });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.deepEqual(result, { items: [], failed: 0, reason: 'no_items_found' });
  assert.equal(calls.meter, 1); // the segmentation call still counts
});

test('an empty (non-null) box list also reads as no_items_found', async () => {
  const { deps } = makeDeps({ segment: async () => [] });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });
  assert.equal(result.reason, 'no_items_found');
  assert.equal(result.items.length, 0);
});

// --- happy path + metering --------------------------------------------------

test('happy path: each box becomes an item, metered once per real call', async () => {
  const boxes = [box({ label: 'a' }), box({ label: 'b' })];
  const { deps, calls } = makeDeps({ segment: async () => boxes });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.equal(result.items.length, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.reason, undefined);
  assert.deepEqual(new Set(result.items.map((i) => i.name)), new Set(['a', 'b']));
  // 1 segmentation + 2 successful crops.
  assert.equal(calls.meter, 3);
  assert.equal(calls.crops.length, 2);
});

test('the box label is passed to the pipeline as the name prefill', async () => {
  const { deps, calls } = makeDeps({ segment: async () => [box({ label: 'black denim jacket' })] });
  await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });
  assert.deepEqual(calls.pipelines, ['black denim jacket']);
});

// --- clamping through the crop seam -----------------------------------------

test('an out-of-bounds box is clamped before it reaches the cropper', async () => {
  const { deps, calls } = makeDeps({
    segment: async () => [box({ x: 0.9, y: 0.1, width: 0.5, height: 0.2 })],
    imageSize: async () => ({ width: 1000, height: 800 }),
  });
  await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.equal(calls.crops.length, 1);
  assert.deepEqual(calls.crops[0], { left: 900, top: 80, width: 100, height: 160 });
});

test('a degenerate box is skipped and counted as failed, never cropped', async () => {
  const { deps, calls } = makeDeps({
    // First box is degenerate (clamps below 1px), second is fine.
    segment: async () => [box({ x: 1, width: 0.0001 }), box({ label: 'ok' })],
  });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.equal(result.items.length, 1);
  assert.equal(result.failed, 1);
  assert.equal(calls.crops.length, 1); // only the valid box was cropped
  assert.equal(calls.meter, 2); // 1 segmentation + 1 successful crop
});

// --- failure isolation ------------------------------------------------------

test('one crop failing does not sink the batch; the failed count is right', async () => {
  const boxes = [box({ label: 'a' }), box({ label: 'boom' }), box({ label: 'c' })];
  const { deps, calls } = makeDeps({
    segment: async () => boxes,
    runPipeline: async ({ label }) => {
      if (label === 'boom') {
        throw new Error('pipeline blew up');
      }
      return fakeItem(label, label);
    },
  });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.equal(result.items.length, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(new Set(result.items.map((i) => i.name)), new Set(['a', 'c']));
  // 1 segmentation + 2 successful crops; the failed crop meters nothing.
  assert.equal(calls.meter, 3);
});

test('a store failure is isolated to its own crop', async () => {
  let n = 0;
  const { deps } = makeDeps({
    segment: async () => [box({ label: 'a' }), box({ label: 'b' })],
    storeCrop: async () => {
      n += 1;
      if (n === 1) {
        throw new Error('R2 down');
      }
      return `u1/${n}.jpg`;
    },
  });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });
  assert.equal(result.items.length, 1);
  assert.equal(result.failed, 1);
});

test('an unsizeable image fails every crop without throwing', async () => {
  const { deps, calls } = makeDeps({
    segment: async () => [box(), box()],
    imageSize: async () => ({ width: 0, height: 0 }),
  });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.deepEqual(result, { items: [], failed: 2 });
  assert.equal(calls.crops.length, 0);
  assert.equal(calls.meter, 1); // only the segmentation call fired
});

// --- concurrency bound ------------------------------------------------------

test('never runs more than the concurrency bound of crops at once', async () => {
  const boxes = Array.from({ length: 8 }, (_unused, i) => box({ label: `x${i}` }));
  let inFlight = 0;
  let peak = 0;
  const { deps } = makeDeps({
    concurrency: 3,
    segment: async () => boxes,
    runPipeline: async ({ label }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return fakeItem(label, label);
    },
  });
  const result = await processBatchPipeline(deps, { rawBytes: BYTES, mediaType: JPEG, segmentationActive: true });

  assert.equal(result.items.length, 8);
  assert.ok(peak <= 3, `peak concurrency ${peak} exceeded bound 3`);
  assert.ok(peak > 1, 'expected some overlap to prove the pool actually parallelizes');
});
