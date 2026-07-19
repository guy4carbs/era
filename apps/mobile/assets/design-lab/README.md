# Design-lab item specimens

Reference cutouts for the **Item Engine** section of `app/design-lab.tsx` — one
per garment category, on transparent backgrounds so the `ItemSurface` treatment
(hairline, sheen, warm-tone wash, glow) reads exactly as it does in the closet.

Expected files (PNG, transparent, roughly 4:5, long edge ~1200px):

```
top.png        bottom.png     shoes.png
outerwear.png  dress.png      accessory.png
```

## Status: present

The six cutouts exist (515×640 transparent RGBA) and `ITEM_LAB_ASSETS` in
`app/design-lab.tsx` `require()`s each one; the matrix renders real garments across
the rest / lift / tilt / selected × light / dark state space.

## Adding or swapping a category

1. Drop a `<category>.png` here (transparent, ~4:5).
2. Point that category's `ITEM_LAB_ASSETS` entry at
   `require('@/assets/design-lab/<category>.png')`. Metro resolves that to the
   `number` source `ItemSurface`'s `uri` prop accepts — no other change needed.

The surface tolerates a `null` entry (token-gradient placeholder), so a category
listed before its asset is drawn degrades gracefully. But `require()` of a
**missing** file IS a hard Metro error, so only `require()` a file that exists.
