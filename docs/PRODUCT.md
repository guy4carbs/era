# Era — Product

The single page for product judgment calls. When in doubt, decide from here.

## The surface

Four tabs, plus Ovi.

- **Feed** — inspiration and what's happening.
- **Closet** — everything the user owns.
- **Design** — build and save outfits.
- **Shop** — discover new pieces.
- **Ovi** — the AI stylist, a floating button available on every screen.

## The core loop

Ovi gives a weather-aware daily outfit suggestion → the user logs what they actually wore → closet data and the taste model improve → tomorrow's suggestion is better. Every day tightens the loop.

## The phase ladder

- **Phase 1 — Foundation.** Closet, daily suggestion, the core loop.
- **Phase 2 — Shop + stickiness.** Discovery and habits that bring users back.
- **Phase 3 — Social + depth.** Sharing, richer taste modeling.
- **Phase 4 — Avatar / checkout / models.** Try-on ("See it on you" — Era+), the cross-store cart and in-flow checkout ("Era Checkout" — buy from multiple verified stores in one checkout), advanced models.

## The trust rule

**Shop your own closet first — Ovi suggests buying only for real gaps.** Never upsell over an outfit the user can already make.

## The aesthetic

The quiet dressing room, made concrete by the Design Revamp V1 (PRs #57–#96;
`packages/tokens` + repo CLAUDE.md are the system of record):

- Editorial serif voice — Fraunces for display/titles and Ovi's italic accent,
  Geist for everything else. Two faces, ever; serif never in controls.
- Warm cream/ink base (#FAF7F0 / #1C1B19) in both modes; garment color always leads.
- Real glass — blur + warm tint + inner highlight — that holds AA legibility
  over busy imagery (Design Lab readout enforces it).
- Glow, not color; warm ink shadows, never pure black (except dark-mode e4).
- Spring motion from tokens only; zero linear easings; reduced motion is a
  designed experience, not an off switch.
- Three signatures: the closet cascade, the daily reveal ritual, and Ovi's
  breathing orb.
- Email carries the same system — cream canvas, the wordmark chip, Georgia as
  the sanctioned Fraunces stand-in.
- The premium serif upgrade (Canela / GT Alpina) stays a documented one-file
  swap for the day revenue justifies the license (CLAUDE.md § Typography).

## The silence rule

**Era is silent by design. Quiet luxury does not chime.** Haptics carry the
feel on iOS — a light impact on outfit save, selection ticks in the quiz and on
toggles — and that is the entire sensory channel beyond motion.

- **No UI sound, ever.** No taps, no chimes, no confirmation dings, no
  notification sounds inside the app. No audio API, no bundled audio asset.
  A PR that adds one is wrong regardless of how tasteful it seems.
- **The one standing exception, deliberately unbuilt:** an optional soft sound
  for the daily reveal (Ovi's morning look) may be REVISITED post-launch —
  off by default, a Settings opt-in, never autoplayed. Until that decision is
  explicitly made, it does not exist in the codebase.
- Haptics stay restrained: selection ticks for choices, light impact for a
  meaningful save. Never on scroll, never on passive events, never stacked.
