# Era — Checkout Sandbox Verification Runbook (Era Checkout, dormant)

> Copy-paste checklist for the operator to verify the **cross-store cart + in-flow
> checkout** ("Era Checkout") against **Rye's sandbox**, one retailer at a time,
> before that retailer is allowed in-flow.
>
> Era Checkout ships **coded-but-dormant** on `main` behind `ERA_CHECKOUT_ENABLED`
> — every cart/checkout route 404s until a real credential is set. This file is
> only the wiring + the per-retailer smoke test.
>
> **The honesty law.** A retailer appears in-flow **only after** you have
> personally smoke-tested it end-to-end in sandbox and added it to
> `ERA_CHECKOUT_RETAILERS`. We never market universal checkout; unsupported
> retailers keep the existing affiliate tap-out. If a retailer is not on the
> verified allowlist, it does not show an in-flow checkout — no exceptions.
>
> **Secret hygiene.** `<PLACEHOLDER>` marks a provider-generated or user-secret
> value. **Never** commit a real value — secrets live only as Railway **service
> variables** and local `.env` (gitignored). Canonical var list:
> `apps/web/.env.example`.

---

## 0. What is dormant, and what wakes it

| Feature | Gate (code) | Dormant behavior | Wakes when |
|---------|-------------|------------------|-----------|
| Cart + in-flow checkout | `ERA_CHECKOUT_ENABLED === 'true'` | every cart/checkout route 404s, zero client trace | `ERA_CHECKOUT_ENABLED=true` **and** Rye creds set |
| Rye order placement | `RYE_API_KEY` set (real) | no order is placed; UI stays tapped-out | `RYE_API_KEY` provisioned |
| Rye webhook (order status) | `RYE_WEBHOOK_SECRET` set (real) | inbound webhooks rejected (signature can't verify) | `RYE_WEBHOOK_SECRET` provisioned |
| Sandbox vs. live | `ERA_CHECKOUT_SANDBOX === 'true'` | — | `true` ⇒ Rye sandbox + **test** payment tokens only |
| Per-retailer in-flow | retailer in `ERA_CHECKOUT_RETAILERS` | that retailer taps out (affiliate) | you add it after passing §2 |

`ERA_CHECKOUT_ENABLED`, `ERA_CHECKOUT_SANDBOX`, `RYE_API_KEY`,
`RYE_WEBHOOK_SECRET`, and `ERA_CHECKOUT_RETAILERS` are **kept out of the zod env
schema** so a missing value never blocks boot (same idiom as turnaround / try-on
— see `CLAUDE.md`).

---

## 1. Env var matrix

All set as **Railway service variables** on the `Era` service (production env; PR
preview environments inherit from it). None committed. For a **staging/sandbox**
verification, set these on a non-production environment first.

| Var | Scope | Rule | What it activates |
|-----|-------|------|-------------------|
| `ERA_CHECKOUT_ENABLED` | server | exact string `'true'` | Un-404s the cart/checkout routes |
| `ERA_CHECKOUT_SANDBOX` | server | exact string `'true'` | Rye sandbox base + test payment tokens (**keep `true` for all of §2**) |
| `RYE_API_KEY` | server | secret | Authenticates Era → Rye order placement |
| `RYE_WEBHOOK_SECRET` | server | secret | Verifies inbound Rye order-status webhooks |
| `ERA_CHECKOUT_RETAILERS` | server | comma-separated | Allowlist of **verified** retailers shown in-flow (start empty) |
| `NEXT_PUBLIC_ERA_CHECKOUT_ENABLED` | client | `'true'` | Cosmetic — renders the cart/checkout UI; never gates access |

> Set with the dashboard, or the CLI (account owner, from repo root):
> ```bash
> railway variables --set ERA_CHECKOUT_ENABLED=true
> railway variables --set ERA_CHECKOUT_SANDBOX=true
> ```
> Changing `NEXT_PUBLIC_*` requires a **redeploy** (inlines at build); server-only
> vars take effect on the next boot.

---

## 2. One-time provisioning (before any retailer test)

1. **Sign up for a Rye trial** at rye.com and open the **sandbox** environment in
   the Rye dashboard.
2. Provision a **sandbox API key** → set `RYE_API_KEY=<PLACEHOLDER_RYE_API_KEY>`.
3. Register Era's **webhook endpoint** in Rye pointing at
   `https://<your-staging-host>/api/checkout/webhook`, and copy the signing
   secret Rye generates → set `RYE_WEBHOOK_SECRET=<PLACEHOLDER_RYE_WEBHOOK_SECRET>`.
4. Set the feature flags on the target (staging) environment:
   ```bash
   railway variables --set ERA_CHECKOUT_ENABLED=true
   railway variables --set ERA_CHECKOUT_SANDBOX=true
   railway variables --set RYE_API_KEY=<PLACEHOLDER_RYE_API_KEY>
   railway variables --set RYE_WEBHOOK_SECRET=<PLACEHOLDER_RYE_WEBHOOK_SECRET>
   # leave ERA_CHECKOUT_RETAILERS UNSET / empty — retailers get added one at a time below
   ```
5. Confirm **migration 0011** (cart + saved shipping address + order records) is
   applied to the target database before enabling (same manual `db:migrate` step
   as in `ACTIVATION.md §2`).

---

## 3. Per-retailer verification (repeat for EACH candidate retailer)

Do **not** add a retailer to `ERA_CHECKOUT_RETAILERS` until every box below is
checked for that retailer. Work in a build with `ERA_CHECKOUT_SANDBOX=true`.

- [ ] **Webhook challenge verifies.** Rye's webhook handshake / challenge for the
      registered endpoint succeeds (signature validates against
      `RYE_WEBHOOK_SECRET`). A failing challenge means the secret or endpoint is
      wrong — fix before continuing.
- [ ] **Add a real product to the cart in TestFlight.** On a TestFlight build of
      the app, add an actual product from **this retailer** to the cross-store cart.
- [ ] **A real staging offer appears.** Rye returns a live sandbox offer for that
      product (price, availability, shipping) — not an error or an empty offer.
- [ ] **Confirm the order with `tok_visa`.** Complete checkout using the Rye
      sandbox test payment token **`tok_visa`** (no real card, no real charge).
- [ ] **Order reaches `completed` with a `vendorOrderId`.** The order transitions
      to a completed status and Rye returns a `vendorOrderId` for the retailer's
      order.
- [ ] **The status webhook lands.** Era receives the Rye order-status webhook for
      that order and records the status against the order record (check the app's
      order history / logs).
- [ ] **Only now, add the retailer to the allowlist:**
      ```bash
      railway variables --set ERA_CHECKOUT_RETAILERS=<existing-list>,<this-retailer>
      ```
      (Append — don't clobber retailers you've already verified.)
- [ ] **Log commission status for this retailer.** From the **Rye dashboard**,
      record whether this retailer is **commission-eligible** and at what rate (or
      "no commission"). Keep this log per retailer so the commission disclosure in
      the Privacy Policy / Terms stays honest.

---

## 4. Commission status log (per retailer)

Maintain a simple table as you verify — this is the source of truth for "Era may
earn a commission on eligible orders." A retailer with no affiliate program still
checks out fine; it just earns nothing.

| Retailer | Verified (date) | In `ERA_CHECKOUT_RETAILERS` | Commission (Rye dashboard) |
|----------|-----------------|-----------------------------|----------------------------|
| _example_ | _2026-07-__ | yes / no | eligible @ __% / none |

---

## 5. Going live (later — real payment is a launch gate)

Everything above is **sandbox**. Turning on **real** payment (flipping
`ERA_CHECKOUT_SANDBOX` off and pointing `RYE_API_KEY` at a live Rye key) is a
separate, later launch gate — do not do it as part of sandbox verification.
Before real payment: confirm Rye's live-mode terms, the payment-token flow charges
correctly, and the Privacy/Terms DRAFTs have been counsel-reviewed and their
`[BRACKETS]` filled (same public-launch precondition as the rest of Phase 1).
