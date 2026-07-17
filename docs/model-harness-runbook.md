# Model harness runbook

Era ships with a **swappable-model harness**: the garment tagger and the outfit-suggestion
ranker each sit behind a `@era/core` interface with a proven **baseline** and a slot for a
learned **candidate**. This runbook is the operator/dev procedure for the day a labeled
corpus exists — how to export it, run the offline eval, read the verdict, and (only on a
measured win) route live traffic onto a trained model.

## The honest state today

**The corpus is empty.** The app is pre-launch, the vision key is dormant, and Ovi's
accept/reject is dark, so no real `tag_correction` / `outfit_accept` / `outfit_reject`
examples exist yet. Consequently **every verdict today is `insufficient_data`** — the
`promotionVerdict` sample-size guard (`@era/core/model-eval`) refuses to promote below
~100 held-out examples no matter the metric. That is the point: this harness is the
*readiness*, not a win. No model is trained; both seams run the baseline.

## The two seams

| Seam | Baseline (proven) | Construction site | Variant flag |
|------|-------------------|-------------------|--------------|
| Tagger | `claude-vision` — the existing `classifyGarment` Claude-vision logic | `getTaggingProvider()` in `apps/web/src/lib/tagging-provider.ts` | `ERA_TAGGER_VARIANT` |
| Ranker | `heuristic-baseline-v1` — the deterministic reference ranker | `getOutfitRanker()` in `apps/web/src/lib/outfit-ranker-provider.ts` | `ERA_RANKER_VARIANT` |

Both flags default to **baseline** when unset. Only the exact string `candidate` selects
the candidate; every other value (unset, `true`, a typo) reads as baseline — a
fat-fingered flag can never route live traffic onto an unproven model. The flags are
**server-authoritative** and **kept out of the zod env schema**, so a missing value never
blocks boot (the turnaround / try-on / checkout precedent).

**There is no trained candidate yet.** Selecting `candidate` today logs a warning and
falls back to the baseline. The candidate branch is the seam a trained model drops into
with no change to the route, persistence, or client.

### A note on the ranker wiring

The tagger seam is **live in the pipeline** (`processItemPipeline` runs
`getTaggingProvider().classify(...)`) — baseline behavior is byte-identical to the
pre-seam code. The ranker seam is **built, tested, and dark**: Ovi's suggestion path is
currently a deterministic *compose* that emits a single look, so there is no candidate
list to rank. The ranker injects when Ovi's path becomes a *rank-candidates* step — the
exact injection point is documented at the top of `outfit-ranker-provider.ts`. Forcing it
in now would be a fake integration (ranking a one-element list), so it stays honest and
ready.

## The corpus: what the eval needs

The eval trains on two labeled example types, both reconstructed from `ai_events`:

- **`TagCorrectionExample`** — `{ input, truth }`: the tagger's input and the user's
  corrected tags (the ground truth). Produced when a user corrects a garment's tags on
  the confirm/edit screen. Each `tag_correction` event now carries `taggerName` (the
  baseline that produced the original guess) alongside `from`/`to`, so an eval knows which
  baseline a correction is scored against — a correction is only a training example if we
  know *what* it corrected and *which model* made the guess.
- **`AcceptRejectExample`** — `{ candidate, ctx, accepted }`: an outfit shown to a user
  and whether they accepted it. Produced by `outfit_accept` / `outfit_reject` events.

> **Payload gap to close before the first real run.** Today's `tag_correction` events are
> written *one per changed field* and carry no image reference, so a single event is not
> yet a full `TagCorrectionExample`. The export step must **join** a correction back to its
> item's image + merged final tags to assemble the self-contained `{ input, truth }` shape
> the runner reads. The runner skips un-joinable per-field events (and reports the count),
> which is the honest behavior. The ranker events are already self-contained.

## Step 1 — export `ai_events` to JSONL

The runner reads a JSONL file, one `{ kind, payload }` row per line. Export from the Neon
production DB. Example with `psql` (adjust to your access path):

```bash
# One JSON object per line — the shape scripts/eval-models.ts parses.
psql "$DATABASE_URL" -tAc \
  "select json_build_object('kind', kind, 'payload', payload)
     from ai_events
    where kind in ('tag_correction','outfit_accept','outfit_reject')" \
  > ai_events.jsonl
```

Or via Railway (run against the production service's `DATABASE_URL`):

```bash
railway run --service Era \
  psql "$DATABASE_URL" -tAc \
  "select json_build_object('kind', kind, 'payload', payload) from ai_events" \
  > ai_events.jsonl
```

(When the tagger-correction join step lands, export the joined view instead so each
`tag_correction` row carries the full `{ input, truth }` payload.)

## Step 2 — run the eval

```bash
node --experimental-strip-types scripts/eval-models.ts ai_events.jsonl
```

The runner reconstructs the corpus, splits a held-out test set, runs baseline-vs-candidate
for each seam, and prints a PROMOTE/HOLD block per model, e.g.:

```
[tagger] HOLD — insufficient_data
  examples: 0 total, 0 held-out (0 scored)
  baseline: 0.0%  candidate: 0.0%  delta: +0.0% (need +2.0%)
```

The exit code is 0 for both PROMOTE and HOLD (a HOLD is a valid answer); it is non-zero
only on a usage or file error.

## Step 3 — read the verdict

`promotionVerdict` returns one of four reasons:

- **`insufficient_data`** — the candidate's held-out count is below the minimum (~100).
  This is today's answer for everything. HOLD.
- **`measured_win`** — the candidate beat the baseline by at least the margin
  (+2 percentage points, absolute) on the headline metric. PROMOTE.
- **`no_improvement`** — a non-negative delta below the margin (including a tie). HOLD.
- **`regression`** — the candidate scored below the baseline. HOLD.

The headline metric is **category accuracy** for the tagger and **pairwise accuracy** for
the ranker.

## Step 4 — flip the variant (only on a measured win)

Only when the verdict is `measured_win` do you route live traffic onto the candidate. Set
the seam's flag to the exact string `candidate` on the Railway production service (and any
PR-preview base env):

```
ERA_TAGGER_VARIANT=candidate   # or ERA_RANKER_VARIANT=candidate
```

Because these inline server-side (not zod-schema'd), a redeploy picks them up; unset or any
other value reverts to the proven baseline. Wiring the actual trained model is a separate,
prior step: replace the candidate branch's warn+fallback in the provider's construction
site with the trained provider's construction. Promotion is a deliberate, measured act — a
flag flip after a green verdict, never a flip on a hunch.

## Verify the harness itself

The runner's reconstruction + eval pipeline is unit-tested end to end against a synthetic
corpus (`apps/web/src/lib/eval-models.test.ts`), which CI runs — so the harness is proven
even while the real corpus is empty. To run locally:

```bash
pnpm exec turbo run test --filter=web...
```
