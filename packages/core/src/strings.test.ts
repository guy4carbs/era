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
