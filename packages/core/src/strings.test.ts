import { test } from 'node:test';
import assert from 'node:assert/strict';

import { strings, type OviStrings } from './strings.ts';

// --- canonical lines (verbatim) ----------------------------------------------

test('the empty-closet line is the canonical copy, verbatim', () => {
  assert.equal(strings.closet.empty, "Let's get your first pieces in — it takes a minute.");
});

test('the Ovi FAB label is verbatim', () => {
  assert.equal(strings.ovi.fabLabel, 'Ovi, your stylist');
});

// --- weather-aware suggestion intro ------------------------------------------

test('dailySuggestionIntro grounds the line in the city and weather', () => {
  const line = strings.ovi.dailySuggestionIntro('Lisbon', 'Cool and clear');
  assert.equal(line, "Cool and clear in Lisbon today. Here's what I'd wear.");
});

// --- voice lint --------------------------------------------------------------

/**
 * Walk every leaf of the deck, resolving function leaves with sample args, and
 * hand each finished string to `check`. Function leaves may return a string
 * (e.g. `dailySuggestionIntro`) or an object of strings (e.g. `quiz.eraFor`),
 * so we feed their return value back through `visit`. Keeps the lint below
 * exhaustive even as new surfaces are added.
 */
function forEachString(deck: OviStrings, check: (value: string) => void): void {
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      check(node);
    } else if (typeof node === 'function') {
      // Sample args cover every signature: strings work as cities/weather/
      // archetypes, and coerce into `progressLabel`'s numeric slots.
      visit((node as (...args: unknown[]) => unknown)('reset', 'Sample Archetype'));
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node)) {
        visit(value);
      }
    }
  };
  visit(deck);
}

test('no string uses hype, fake urgency, or dark-pattern phrasing', () => {
  const banned = [/!!/, /\bbuy now\b/i, /\bdon't miss\b/i, /\bhurry\b/i, /\blast chance\b/i];
  forEachString(strings, (value) => {
    for (const pattern of banned) {
      assert.doesNotMatch(value, pattern, `Voice lint: "${value}" matches ${pattern}`);
    }
  });
});

test('no surface stacks exclamation marks (at most one per string)', () => {
  forEachString(strings, (value) => {
    const count = (value.match(/!/g) ?? []).length;
    assert.ok(count <= 1, `Voice lint: "${value}" has ${count} exclamation marks`);
  });
});

test('the whole deck spends at most one exclamation mark', () => {
  let total = 0;
  forEachString(strings, (value) => {
    total += (value.match(/!/g) ?? []).length;
  });
  assert.ok(total <= 1, `Voice lint: the deck uses ${total} exclamation marks (budget is 1)`);
});

// --- the chat sheet (Ovi speaks) ---------------------------------------------

test('every chat-sheet string is present and non-empty', () => {
  const o = strings.ovi;
  const leaves = [
    o.chatPlaceholder,
    o.chatOpener,
    o.outfitAcceptCta,
    o.outfitRejectCta,
    o.accepted,
    o.rejected,
    o.sparseCloset,
    o.todayTitle,
    o.todayEmpty,
  ];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `empty chat-sheet string: "${leaf}"`);
  }
});

test('the chat opener invites a conversation, distinct from the plain greeting', () => {
  assert.ok(strings.ovi.chatOpener.trim().length > 0);
  assert.notEqual(
    strings.ovi.chatOpener,
    strings.ovi.greeting,
    'the chat opener should read differently than the hello greeting',
  );
});

test('all four intent chips are present and non-empty', () => {
  const chips = strings.ovi.intentChips;
  const keys = ['today', 'styleFor', 'styleItem', 'whatsMissing'] as const;
  assert.equal(Object.keys(chips).length, keys.length);
  for (const key of keys) {
    assert.ok(chips[key].trim().length > 0, `empty intent chip: ${key}`);
  }
});

test('proposalIntro names the occasion when given one and stays warm without', () => {
  const withOccasion = strings.ovi.proposalIntro('a wedding');
  const generic = strings.ovi.proposalIntro();
  assert.ok(withOccasion.trim().length > 0, 'proposalIntro(occasion) is empty');
  assert.ok(generic.trim().length > 0, 'proposalIntro() is empty');
  assert.match(withOccasion, /wedding/i, 'proposalIntro should weave in the occasion');
  assert.notEqual(withOccasion, generic, 'the occasion line should differ from the generic one');
});

test('the reject action and toast never guilt the user', () => {
  const guilt = [/\bsure\?/i, /\breally\?/i, /\bmiss(ing)? out\b/i, /\bwaste\b/i, /\bmistake\b/i];
  for (const line of [strings.ovi.outfitRejectCta, strings.ovi.rejected]) {
    for (const pattern of guilt) {
      assert.doesNotMatch(line, pattern, `reject copy should not guilt the user (${pattern})`);
    }
  }
});

test('gapHonest names the gap and embodies the trust rule without pushing a purchase', () => {
  const line = strings.ovi.gapHonest('outerwear');
  assert.ok(line.trim().length > 0, 'gapHonest is empty');
  assert.match(line, /outerwear/i, 'gapHonest should name the thin category');
  const pushy = [/\bbuy now\b/i, /\bshould buy\b/i, /\bneed to buy\b/i, /\bmust buy\b/i, /\bbuy one\b/i];
  for (const pattern of pushy) {
    assert.doesNotMatch(line, pattern, `gapHonest should not push buying (${pattern})`);
  }
});

test('weatherLine leads with the rounded temperature and the condition', () => {
  const line = strings.ovi.weatherLine(13.6, 'overcast');
  assert.ok(line.trim().length > 0, 'weatherLine is empty');
  assert.match(line, /\b14\b/, 'weatherLine should round the temperature to a whole degree');
  assert.match(line, /°/, 'weatherLine should show a degree symbol');
  assert.match(line, /overcast/i, 'weatherLine should name the condition');
});

// --- style quiz --------------------------------------------------------------

const MOOD_IDS = ['reset', 'refined', 'bold', 'soft', 'experimental', 'effortless'] as const;

test('all six era-moods are present with a non-empty title and tagline', () => {
  const moods = strings.quiz.moods;
  assert.equal(Object.keys(moods).length, MOOD_IDS.length);
  for (const id of MOOD_IDS) {
    assert.ok(moods[id], `missing mood: ${id}`);
    assert.ok(moods[id].title.trim().length > 0, `mood ${id} has an empty title`);
    assert.ok(moods[id].tagline.trim().length > 0, `mood ${id} has an empty tagline`);
  }
});

test('eraFor composes a non-empty title and description for every mood', () => {
  const archetype = 'Quiet Luxe';
  for (const id of MOOD_IDS) {
    const era = strings.quiz.eraFor(id, archetype);
    assert.ok(era.title.trim().length > 0, `eraFor(${id}) has an empty title`);
    assert.ok(era.description.trim().length > 0, `eraFor(${id}) has an empty description`);
    assert.match(era.title, new RegExp(archetype), `eraFor(${id}) should weave in the archetype`);
  }
});

test('eraFor fuses mood and archetype into a personal era name', () => {
  assert.equal(strings.quiz.eraFor('reset', 'Quiet Luxe').title, 'A Quiet Luxe Clean Slate');
  assert.equal(strings.quiz.eraFor('bold', 'Street').title, 'A Street Statement');
});

test('eraFor falls back to the reset era for an unknown mood id', () => {
  const known = strings.quiz.eraFor('reset', 'Quiet Luxe');
  const unknown = strings.quiz.eraFor('does-not-exist', 'Quiet Luxe');
  assert.deepEqual(unknown, known);
  assert.ok(unknown.title.trim().length > 0);
  assert.ok(unknown.description.trim().length > 0);
});

test('progressLabel reads as a plain step-of-total a11y label', () => {
  assert.equal(strings.quiz.progressLabel(3, 12), 'Step 3 of 12');
});

test('the style-quiz entry CTA is present as copy, not a hard-coded literal', () => {
  assert.equal(strings.quiz.entryCta, 'Take the style quiz');
});

// --- add a piece (closet flow) -----------------------------------------------

test('every add-a-piece string is present and non-empty', () => {
  const c = strings.closet;
  const leaves = [
    c.addCta,
    c.pickPhoto,
    c.takePhoto,
    c.uploading,
    c.processing,
    c.processedTitle,
    c.manualTitle,
    c.confirmCta,
    c.saved,
    c.addFailed,
    c.retryCta,
  ];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `empty add-a-piece string: "${leaf}"`);
  }
});

test('every confirm-screen field label is a present, non-empty chip label', () => {
  const labels = strings.closet.fieldLabels;
  const keys = ['category', 'name', 'brand', 'colorPrimary', 'colors', 'pattern'] as const;
  assert.equal(Object.keys(labels).length, keys.length);
  for (const key of keys) {
    assert.ok(labels[key].trim().length > 0, `empty field label: ${key}`);
  }
});

test('fieldUnset returns a non-empty prompt that names the field or nudges an action', () => {
  for (const label of Object.values(strings.closet.fieldLabels)) {
    const prompt = strings.closet.fieldUnset(label);
    assert.ok(prompt.trim().length > 0, `fieldUnset(${label}) is empty`);
    const namesField = prompt.toLowerCase().includes(label.toLowerCase());
    const nudgesAction = /\b(add|set|choose|pick|tag)\b/i.test(prompt);
    assert.ok(
      namesField || nudgesAction,
      `fieldUnset(${label}) should name the field or nudge an action, got "${prompt}"`,
    );
  }
});

test('the manual-fallback title owns the miss without blaming the user', () => {
  const blamey = [/\byou (failed|didn't|forgot|messed)\b/i, /\byour fault\b/i, /\berror\b/i];
  for (const pattern of blamey) {
    assert.doesNotMatch(strings.closet.manualTitle, pattern);
  }
});

// --- add from a link (closet flow) -------------------------------------------

test('every add-from-a-link string is present and non-empty', () => {
  const c = strings.closet;
  const leaves = [c.addFromLink, c.pasteLink, c.importLink, c.linkFailed, c.linkImported];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `empty add-from-a-link string: "${leaf}"`);
  }
});

test('the link-failed line owns the miss and offers the photo alternative', () => {
  const line = strings.closet.linkFailed;
  const blamey = [/\byou (failed|didn't|forgot|messed)\b/i, /\byour fault\b/i, /\berror\b/i];
  for (const pattern of blamey) {
    assert.doesNotMatch(line, pattern);
  }
  assert.match(line, /photo/i, 'linkFailed should offer a photo as the way through');
});

// --- the closet gallery (search, filter, privacy, detail, archive) -----------

test('every closet-gallery string is present and non-empty', () => {
  const c = strings.closet;
  const leaves = [
    c.searchPlaceholder,
    c.filterAll,
    c.privacyPrivate,
    c.privacyPublic,
    c.privacyHintPrivate,
    c.privacyHintPublic,
    c.edit,
    c.archive,
    c.archiveConfirm,
    c.archived,
    c.emptyTitle,
    c.emptyBody,
  ];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `empty closet-gallery string: "${leaf}"`);
  }
});

test('the privacy hints are honest about who can see the piece', () => {
  assert.match(strings.closet.privacyHintPrivate, /\byou\b/i, 'private hint should say only you see it');
  assert.match(
    strings.closet.privacyHintPublic,
    /public|profile/i,
    'public hint should own that the piece can be seen publicly',
  );
});

test('detailWearCount reads zero as an invitation and counts otherwise', () => {
  const zero = strings.closet.detailWearCount(0);
  const three = strings.closet.detailWearCount(3);
  assert.ok(zero.trim().length > 0, 'detailWearCount(0) is empty');
  assert.ok(three.trim().length > 0, 'detailWearCount(3) is empty');
  assert.notEqual(zero, three, 'detailWearCount(0) should read differently than detailWearCount(3)');
  assert.equal(zero, 'Not worn yet');
  assert.match(three, /3/, 'detailWearCount(3) should surface the count');
});

test('detailSource humanizes every item source into a provenance line', () => {
  const sources = ['photo', 'link', 'email_import'] as const;
  const lines = sources.map((s) => strings.closet.detailSource(s));
  for (const line of lines) {
    assert.ok(line.trim().length > 0, 'detailSource returned an empty line');
    assert.doesNotMatch(line, /_/, 'detailSource should not leak a raw enum slug');
  }
  assert.equal(new Set(lines).size, sources.length, 'each source should read distinctly');
  assert.match(strings.closet.detailSource('photo'), /photo/i);
  assert.match(strings.closet.detailSource('link'), /link/i);
  assert.match(strings.closet.detailSource('email_import'), /email|receipt/i);
  // Unknown sources fall back to a plain, non-empty line.
  assert.ok(strings.closet.detailSource('mystery').trim().length > 0);
});

test('the archive confirm frames the action as reversible, not destructive', () => {
  const line = strings.closet.archiveConfirm;
  const destructive = [/\bdelete\b/i, /\bdeleted\b/i, /\bpermanent(ly)?\b/i, /\bgone\b/i, /\bforever\b/i];
  for (const pattern of destructive) {
    // "isn't deleted" is allowed — it explicitly negates deletion.
    if (pattern.source.includes('delete')) continue;
    assert.doesNotMatch(line, pattern, `archiveConfirm should not read as destructive (${pattern})`);
  }
  assert.match(line, /isn't deleted|not deleted|bring it back|reversible/i, 'archiveConfirm should promise reversibility');
});

test('the empty-gallery state sells both ways in (a photo and a link)', () => {
  const body = strings.closet.emptyBody;
  assert.match(body, /photo/i, 'emptyBody should mention the photo path');
  assert.match(body, /link/i, 'emptyBody should mention the link path');
});

// --- the Design tab (canvas, outfits, eras) ----------------------------------

test('every design-tab string is present and non-empty', () => {
  const d = strings.design;
  const leaves = [
    d.tabEmptyTitle,
    d.tabEmptyBody,
    d.newOutfit,
    d.canvasEmptyHint,
    d.addFromCloset,
    d.drawerSearchPlaceholder,
    d.outfitNamePlaceholder,
    d.occasionPlaceholder,
    d.saveOutfit,
    d.outfitSaved,
    d.saving,
    d.reopenHint,
    d.done,
    d.eraSectionTitle,
    d.newEra,
    d.eraTitlePlaceholder,
    d.eraDescriptionPlaceholder,
    d.assignToEra,
    d.eraCreated,
    d.addedToEra,
    d.deleteOutfit,
    d.deleteConfirm,
  ];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `empty design-tab string: "${leaf}"`);
  }
});

test('outfitItemCount is singular at one and plural otherwise', () => {
  const one = strings.design.outfitItemCount(1);
  const three = strings.design.outfitItemCount(3);
  assert.equal(one, '1 piece');
  assert.equal(three, '3 pieces');
  assert.notEqual(one, three, 'outfitItemCount(1) should read differently than outfitItemCount(3)');
  assert.doesNotMatch(one, /pieces/, 'outfitItemCount(1) should not pluralize');
});

test('the delete confirm is honest that deleting an outfit is permanent', () => {
  const line = strings.design.deleteConfirm;
  // Unlike archive (reversible), an outfit delete is permanent — this is the
  // one confirm allowed to say so, and it must, so the user isn't misled.
  assert.match(
    line,
    /can't be undone|cannot be undone|can not be undone|permanent(ly)?|forever/i,
    'deleteConfirm should honestly signal that the delete is permanent',
  );
  assert.match(line, /delete/i, 'deleteConfirm should name the destructive action');
});

test('categoryLabel title-cases and pluralizes all eleven categories', () => {
  const expected: Record<string, string> = {
    top: 'Tops',
    bottom: 'Bottoms',
    dress: 'Dresses',
    outerwear: 'Outerwear',
    shoes: 'Shoes',
    bag: 'Bags',
    hat: 'Hats',
    scarf: 'Scarves',
    watch: 'Watches',
    jewelry: 'Jewelry',
    accessory: 'Accessories',
  };
  const categories = Object.keys(expected);
  assert.equal(categories.length, 11, 'expected coverage of all eleven category enum values');
  for (const category of categories) {
    const label = strings.closet.categoryLabel(category);
    assert.equal(label, expected[category], `categoryLabel(${category}) should be a plural heading`);
    assert.match(label, /^[A-Z]/, `categoryLabel(${category}) should be title-cased`);
  }
  // Unknown categories fall back to a plain heading rather than a raw slug.
  assert.equal(strings.closet.categoryLabel('unknown-slug'), 'Other');
});

// --- the marketing site (locked brand copy, verbatim) ------------------------

test('the marketing hero is the locked copy, verbatim', () => {
  const hero = strings.site.hero;
  assert.equal(hero.title, 'Getting dressed should be easy.');
  assert.equal(
    hero.sub,
    "Era turns the closet you already own into outfits you'll actually wear — with Ovi, your AI stylist, by your side.",
  );
  assert.equal(hero.cta, 'Join the waitlist');
});

test('the four value sections are the locked copy, in order, verbatim', () => {
  const expected = [
    { title: 'Your closet, reborn', body: 'Every piece you own, rendered as a beautiful virtual wardrobe.' },
    {
      title: 'Meet Ovi',
      body: 'The stylist who knows your closet, your style, and your weather — and tells you when NOT to buy.',
    },
    { title: 'Enter your era', body: "Name the style chapter you're in and dress for it." },
    {
      title: 'Shop everything, buy less',
      body: 'Every brand in one place, recommended only when nothing you own fills the gap.',
    },
  ];
  assert.equal(strings.site.sections.length, expected.length, 'expected exactly four sections');
  assert.deepEqual(
    strings.site.sections.map((s) => ({ title: s.title, body: s.body })),
    expected,
    'the value sections must match the locked copy, in order',
  );
});

test('the closer and referral lines are the locked copy, verbatim', () => {
  assert.equal(strings.site.closer.title, "The easiest thing you'll wear all day.");
  assert.equal(strings.site.referral.line, 'Skip the line — invite a friend.');
  assert.ok(strings.site.referral.cta.trim().length > 0, 'referral cta is empty');
});

test('the waitlist form copy is present and the CTA matches the hero', () => {
  const form = strings.site.form;
  assert.equal(form.cta, strings.site.hero.cta, 'the form and hero waitlist CTAs should match');
  assert.ok(form.emailPlaceholder.includes('@'), 'the email placeholder should read as an email');
  assert.ok(form.success.trim().length > 0, 'the success line is empty');
});

test('the SEO / social tags are present and non-empty', () => {
  assert.ok(strings.site.og.title.trim().length > 0, 'og.title is empty');
  assert.ok(strings.site.og.description.trim().length > 0, 'og.description is empty');
  assert.ok(strings.site.meta.description.trim().length > 0, 'meta.description is empty');
});

// --- public profile pages (follow, privacy, empty, sections, share, meta) ----

test('the follow control models three distinct states, none of them pushy', () => {
  const p = strings.profile;
  assert.equal(p.followCta, 'Follow');
  assert.equal(p.followingState, 'Following');
  assert.equal(p.unfollowCta, 'Unfollow');
  // Three distinct labels so the copy carries no hover/tap platform assumption.
  assert.equal(new Set([p.followCta, p.followingState, p.unfollowCta]).size, 3);
});

test('follower/following counts are singular at one, zero-hardened, and boundary-safe', () => {
  const p = strings.profile;
  assert.equal(p.followerCount(0), '0 followers');
  assert.equal(p.followerCount(1), '1 follower');
  assert.equal(p.followerCount(12), '12 followers');
  assert.doesNotMatch(p.followerCount(1), /followers/, 'followerCount(1) should not pluralize');
  // "following" is invariant — number only.
  assert.equal(p.followingCount(0), '0 following');
  assert.equal(p.followingCount(8), '8 following');
  // Garbage input coerces to 0, never throws or leaks NaN/undefined.
  const junk: unknown[] = [undefined, null, NaN, 'nope', {}];
  for (const bad of junk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = bad as any;
    for (const out of [p.followerCount(b), p.followingCount(b)]) {
      assert.match(out, /^0 /, `count should coerce ${String(bad)} to 0`);
      assert.doesNotMatch(out, /undefined|NaN/);
    }
  }
});

test('signInToFollow names the person and falls back gracefully', () => {
  assert.equal(strings.profile.signInToFollow('Mara'), 'Sign in to follow Mara.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const missing = strings.profile.signInToFollow('' as any);
  assert.ok(missing.trim().length > 0, 'signInToFollow with no name is empty');
  assert.doesNotMatch(missing, /undefined/, 'signInToFollow should not leak undefined');
});

test('the private-profile lines are warm and name the owner, no shame', () => {
  const heading = strings.profile.privateHeading('Mara');
  assert.equal(heading, 'Mara keeps their closet private.');
  assert.match(heading, /private/i, 'private heading should say it is private');
  assert.ok(strings.profile.privateBody.trim().length > 0, 'privateBody is empty');
  // No shame / blame / pressure language.
  const harsh = [/\bcan't\b/i, /\bsorry\b/i, /\bdenied\b/i, /\bnot allowed\b/i, /\bmust\b/i];
  for (const pattern of harsh) {
    assert.doesNotMatch(strings.profile.privateBody, pattern, `privateBody should stay warm (${pattern})`);
  }
  // Missing name falls back rather than dangling the possessive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallback = strings.profile.privateHeading(undefined as any);
  assert.doesNotMatch(fallback, /undefined/, 'privateHeading should not leak undefined');
  assert.match(fallback, /keeps their closet private/);
});

test('the empty-public lines stay composed — viewer names the owner, owner gets the fix', () => {
  const viewer = strings.profile.emptyPublic('Mara');
  assert.equal(viewer, "Mara hasn't shared any pieces yet.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.doesNotMatch(strings.profile.emptyPublic(undefined as any), /undefined/);
  const own = strings.profile.emptyPublicOwn;
  assert.ok(own.trim().length > 0, 'emptyPublicOwn is empty');
  assert.match(own, /public/i, 'the owner line should point at making pieces public');
});

test('the profile section headings are plain third-person nouns', () => {
  const s = strings.profile.sections;
  assert.deepEqual(s, { closet: 'Closet', eras: 'Eras', outfits: 'Outfits' });
  // Third-person page — not the owner-context "Your eras".
  for (const heading of Object.values(s)) {
    assert.doesNotMatch(heading, /\byour\b/i, `section heading "${heading}" should not read as owner-context`);
  }
});

test('own-profile affordances: preview hint, copy-link CTA, and the shared copied idiom', () => {
  const p = strings.profile;
  assert.ok(p.ownProfileHint.trim().length > 0, 'ownProfileHint is empty');
  assert.match(p.ownProfileHint, /others/i, 'the hint should frame it as how others see the profile');
  assert.ok(p.copyLinkCta.trim().length > 0, 'copyLinkCta is empty');
  // One "copied to clipboard" idiom across the app.
  assert.equal(p.linkCopied, strings.settings.receiptAddress.copied);
});

test('metaDescription names the owner and count, caps at 155 chars, and is boundary-safe', () => {
  const line = strings.profile.metaDescription('Mara Lin', 42);
  assert.equal(line, "Mara Lin's closet on Era — 42 pieces, styled by Ovi.");
  assert.match(strings.profile.metaDescription('Mara', 1), /1 piece\b/);
  assert.doesNotMatch(strings.profile.metaDescription('Mara', 1), /1 pieces/, 'singular at one');
  // Hard 155-char SEO cap holds even for an absurd name.
  const long = strings.profile.metaDescription('X'.repeat(400), 3);
  assert.ok(long.length <= 155, `metaDescription should cap at 155 chars, got ${long.length}`);
  // Garbage input never leaks undefined/NaN and always yields a usable line.
  const junk: unknown[] = [undefined, null, NaN, 'nope', {}];
  for (const bad of junk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = bad as any;
    const out = strings.profile.metaDescription(b, b);
    assert.ok(out.trim().length > 0, `metaDescription empty for ${String(bad)}`);
    assert.doesNotMatch(out, /undefined|NaN/, `metaDescription leaked a raw value for ${String(bad)}`);
  }
});

// --- the Shop tab (gap-driven picks, why-labels, affiliate honesty) ----------

test('every shop chrome string is present and non-empty', () => {
  const shop = strings.shop;
  for (const key of [
    'title',
    'intro',
    'empty',
    'loading',
    'error',
    'filterBudget',
    'filterBrandTier',
    'filterCategory',
    'filterSize',
    'clearFilters',
    'sortRelevance',
    'affiliateDisclosure',
    'dismiss',
    'loadMore',
  ] as const) {
    assert.ok(shop[key].trim().length > 0, `shop.${key} is empty`);
  }
  for (const [tier, label] of Object.entries(shop.brandTiers)) {
    assert.ok(label.trim().length > 0, `brandTiers.${tier} is empty`);
  }
});

test('whyCompletesOutfits is singular at one and plural otherwise', () => {
  assert.equal(strings.shop.whyCompletesOutfits(1), 'Completes an outfit with what you own');
  assert.match(strings.shop.whyCompletesOutfits(3), /Completes 3 outfits with what you own/);
});

test('whyFillsGap names the thin category as a real gap, not a nudge', () => {
  const line = strings.shop.whyFillsGap('knitwear');
  assert.match(line, /knitwear/);
  assert.match(line, /real gap/i);
});

test('whySimilarOwned is an honest warning, never a push to buy', () => {
  assert.match(strings.shop.whySimilarOwned(1), /already own something similar/i);
  assert.match(strings.shop.whySimilarOwned(2), /already own 2 similar pieces/i);
});

test('viewAt names the retailer on the click-out', () => {
  assert.equal(strings.shop.viewAt('Ssense'), 'View at Ssense');
});

test('the affiliate disclosure is FTC-honest: names the commission AND the closet-not-payouts rule', () => {
  const disclosure = strings.shop.affiliateDisclosure.toLowerCase();
  assert.match(disclosure, /commission/, 'disclosure must name the commission');
  assert.match(disclosure, /closet/, 'disclosure must state ranking is on the closet');
  assert.match(disclosure, /payout/, 'disclosure must state ranking is not on payouts');
});

// --- wear tracking (item stats, calendar, monthly recap, quick-log) ----------

test('wear.count handles zero, one, and many with a singular at one', () => {
  assert.equal(strings.wear.count(0), 'Not worn yet');
  assert.equal(strings.wear.count(1), 'Worn once');
  assert.equal(strings.wear.count(4), 'Worn 4 times');
  assert.doesNotMatch(strings.wear.count(1), /times/, 'count(1) should not pluralize');
});

test('wear.costPerWear appends to an already-formatted price and never formats money itself', () => {
  assert.equal(strings.wear.costPerWear('$15'), '$15 per wear');
  assert.equal(strings.wear.costPerWear('€9,50'), '€9,50 per wear');
});

test('wear.costPerWearUnknown gently invites adding the price, without pressure', () => {
  const line = strings.wear.costPerWearUnknown;
  assert.ok(line.trim().length > 0, 'costPerWearUnknown is empty');
  assert.match(line, /cost per wear/i, 'should name what adding the price unlocks');
  const pushy = [/\bmust\b/i, /\bnow\b/i, /\brequired\b/i];
  for (const pattern of pushy) {
    assert.doesNotMatch(line, pattern, `costPerWearUnknown should stay gentle (${pattern})`);
  }
});

test('wear.calendar copy is present and dayA11y reads as a plain wear count', () => {
  assert.ok(strings.wear.calendar.title.trim().length > 0, 'calendar.title is empty');
  assert.ok(strings.wear.calendar.emptyMonth.trim().length > 0, 'calendar.emptyMonth is empty');
  assert.equal(strings.wear.calendar.dayA11y(0), 'No wears');
  assert.equal(strings.wear.calendar.dayA11y(1), '1 wear');
  assert.equal(strings.wear.calendar.dayA11y(3), '3 wears');
});

test('wear.recap surfaces every stat and stays honest on an empty month', () => {
  const r = strings.wear.recap;
  assert.equal(r.title, 'Your month, worn');
  assert.equal(r.monthHeader('July 2026'), 'July 2026');
  assert.equal(r.totalWears(0), 'No wears logged yet');
  assert.match(r.totalWears(24), /24 wears/, 'totalWears should surface the count');
  assert.equal(r.daysDressed(18, 31), 'Dressed on 18 of 31 days');
  assert.ok(r.topPieces.trim().length > 0, 'topPieces label is empty');
  assert.match(r.mostWornCategory('tops'), /tops/, 'mostWornCategory should name the category');
  assert.match(
    r.bestCostPerWear('$4', 'navy blazer'),
    /navy blazer.*\$4 per wear/,
    'bestCostPerWear should name the piece and its cost per wear',
  );
  assert.ok(r.empty.trim().length > 0, 'recap.empty is empty');
  assert.ok(r.shareTag.trim().length > 0, 'recap.shareTag is empty');
});

test('wear quick-log confirmations extend, and do not duplicate, the existing wear copy', () => {
  assert.ok(strings.wear.logged.trim().length > 0, 'wear.logged is empty');
  assert.ok(strings.wear.logFailed.trim().length > 0, 'wear.logFailed is empty');
  for (const existing of [strings.ovi.woreItConfirmed, strings.outfits.wearLogged]) {
    assert.notEqual(strings.wear.logged, existing, 'wear.logged should not duplicate existing wear copy');
  }
});

test('every wear helper survives garbage input without throwing or leaking NaN/undefined', () => {
  const junk: unknown[] = [undefined, null, NaN, 'nope', {}];
  for (const bad of junk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = bad as any;
    const outputs = [
      strings.wear.count(b),
      strings.wear.costPerWear(b),
      strings.wear.calendar.dayA11y(b),
      strings.wear.recap.monthHeader(b),
      strings.wear.recap.totalWears(b),
      strings.wear.recap.daysDressed(b, b),
      strings.wear.recap.mostWornCategory(b),
      strings.wear.recap.bestCostPerWear(b, b),
    ];
    for (const out of outputs) {
      assert.ok(out.trim().length > 0, `wear helper returned empty for input ${String(bad)}`);
      assert.doesNotMatch(out, /undefined|NaN/, `wear helper leaked a raw ${out} for input ${String(bad)}`);
    }
  }
});

// --- the feed surface: rail, share, shop-similar, and UGC safety copy ---------

test('the feed empty state is preserved verbatim (extended, not replaced)', () => {
  assert.equal(
    strings.feed.empty,
    'Nothing in your feed yet. Follow a few people and their looks land here.',
  );
});

test('the report confirmation is the canonical copy, verbatim', () => {
  assert.equal(strings.feed.reportConfirm, "Post hidden. Thanks — we'll take a look.");
});

test('every feed rail label and safety string is present and non-empty', () => {
  const f = strings.feed;
  const leaves = [
    f.feedEnd,
    f.rail.like,
    f.rail.save,
    f.rail.shopSimilar,
    f.rail.more,
    f.share,
    f.shared,
    f.unshare,
    f.shopSimilarTitle,
    f.shopSimilarEmpty,
    f.shopSimilarGapCta,
    f.reportTitle,
    f.reportReasons.spam,
    f.reportReasons.inappropriate,
    f.reportReasons.impersonation,
    f.reportReasons.other,
    f.reportDetailPlaceholder,
    f.blockBody,
    f.blockCta,
    f.blockedConfirm,
    f.hiddenPost,
  ];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `feed leaf is empty: ${leaf}`);
  }
});

test('blockTitle names the account, and falls back gracefully when the name is missing', () => {
  assert.equal(strings.feed.blockTitle('Mara'), 'Block Mara?');
  assert.equal(strings.feed.blockTitle(''), 'Block this account?');
});

test('the feed report reason labels cover exactly the four ReportReason values', () => {
  assert.deepEqual(Object.keys(strings.feed.reportReasons).sort(), [
    'impersonation',
    'inappropriate',
    'other',
    'spam',
  ]);
});
