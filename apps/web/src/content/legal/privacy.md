<!-- DRAFT — not reviewed by counsel. Placeholders in [BRACKETS] must be completed and the documents reviewed by a lawyer before public launch. -->

# Privacy Policy

Last updated: 2026-07-04
Effective date: 2026-07-04

Era is a virtual wardrobe app. It helps you catalog the clothes you already own, compose outfits, and get styling ideas from Ovi, our AI stylist. This policy explains what we collect, why, who we share it with, and the choices and rights you have. We've tried to write it in plain language. Where the law requires more precise terms, we use them — but we've kept the legalese to a minimum.

This policy is provided by [ERA LEGAL ENTITY] ("Era", "we", "us", or "our"). If anything here is unclear, email us at support@era.style.

## The short version

- We collect what we need to run your wardrobe: your email, the clothing photos and details you add, the outfits and style chapters ("eras") you create, your wear logs, and your style profile.
- We use trusted service providers (for hosting, storage, email, weather, and AI) to operate the app. We don't sell your data.
- Ovi, our AI stylist, sends your closet and style information — plus a coarse, city-level location you choose to grant — to an AI model to generate suggestions. That coarse location is used only to look up the weather, and it is not stored.
- You can delete your account and everything in it at any time from **Settings → Delete account**. We immediately and permanently remove your live data — every record and every image you've stored — and any residual copies in our encrypted backups are purged automatically shortly after.
- Your closet is **private by default**. If you choose to make it public, your item cutout images and outfit covers become viewable at public web links (no login needed) until you switch it back to private.

## Who this applies to

Era is intended for people who are old enough to use it under the law where they live (see [Children and age](#children-and-age)). It is not directed at children.

## Information we collect

### Information you give us

- **Account information.** Your email address, which we use to sign you in with a magic link. We plan to add Apple and Google sign-in; if you use those, the provider shares a limited identifier and your email with us so we can create or match your account.
- **Waitlist information.** If you join our waitlist before you have an account, we collect your email address and, optionally, referral attribution (for example, who referred you or which link you came from).
- **Closet data.** Photos of your clothing that you upload or import from a product link, and details about those items. When you add an item, our AI extracts attributes such as category, color, pattern, and brand to help organize your closet.
- **Outfits and eras.** The outfits you compose and the "eras" (style chapters) you create.
- **Wear logs.** Records of when you wear items or outfits, if you choose to log them.
- **Style profile.** Answers to a short style quiz, which we use to build a taste model (for example, a style archetype and color palette).

### Information we generate or collect automatically

- **AI-extracted attributes.** The clothing attributes described above, produced automatically when you add items.
- **Coarse location (only if you grant it).** If you allow it, Era uses a rounded, approximately city-level location to fetch local weather so Ovi can suggest weather-appropriate outfits. This location is deliberately imprecise, is used only for the weather lookup, and is **not stored**.
- **Product and usage analytics.** We may collect privacy-friendly, event-level analytics about how the app is used (for example, that a feature was opened) to understand and improve Era. This is not used to build advertising profiles, and we do not sell it. *(Our analytics capability is currently dormant and not active.)*
- **Device and session information.** When you sign in, we log your IP address and browser/device user agent with your session. We use this to keep your account secure, operate the service, and help prevent abuse.
- **Weather snapshot on wear logs.** When you log a wear, we may store the derived weather at that time (for example, "cool, light rain") alongside the log so you can see what you wore in what conditions. This is the resulting weather, not your location — your coarse location itself is still not stored.

We do **not** collect precise GPS location, and we don't use your closet photos for advertising.

## How and why we use your information, and our legal bases

Where the EU/UK GDPR applies, we rely on the legal bases noted below.

| What we do | Why | Legal basis (GDPR) |
|---|---|---|
| Create and secure your account; sign you in | To provide the service you asked for | Performance of a contract |
| Store and organize your closet, outfits, eras, and wear logs | Core functionality of the app | Performance of a contract |
| Extract clothing attributes with AI | To organize and search your closet | Performance of a contract |
| Build your style profile from the quiz | To personalize styling | Performance of a contract |
| Generate outfit suggestions with Ovi (including coarse-location weather lookup) | To provide styling; weather makes suggestions relevant | Performance of a contract; consent for using your granted location |
| Send you account and service emails | To operate your account | Performance of a contract |
| Waitlist emails and referral attribution | To manage the waitlist and let you know about launch | Consent, and our legitimate interest in growing Era |
| Product analytics and improving the app | To keep Era working well and make it better | Legitimate interests (kept privacy-friendly) |
| Prevent abuse, fraud, and security incidents | To keep Era safe | Legitimate interests; legal obligation |

Where we rely on consent (for example, granting Era access to your coarse location, or certain marketing), you can withdraw it at any time without affecting processing already carried out.

## AI and automated styling

Ovi is an AI stylist. To generate suggestions, Era sends the following to an AI model provider: your closet inventory, your style profile, your wear history, and — only if you've granted it — a coarse, city-level location used to fetch weather. Ovi uses this to propose outfits from clothes you already own.

A few things to know:

- Ovi's suggestions are **automated** and are not professional styling, medical, or any other kind of professional advice.
- Ovi's large-language-model brain is **currently dormant**; today a deterministic (rule-based) stylist generates suggestions. When the LLM is active, the data described above is sent to our AI provider (see [Who we share data with](#who-we-share-data-with)) to produce a response.
- We do not use your data to train third-party foundation models, and we ask our AI provider not to train their general models on it. (See our provider list below.)
- You are always in control: Ovi suggests, you decide. Nothing is purchased or shared automatically.

You have the right not to be subject to solely automated decisions that produce legal or similarly significant effects. Ovi's outfit suggestions do not have that kind of effect — they're style ideas — but if you have concerns, contact us and a human will help.

## Who we share data with

We don't sell your personal information. We share it only with service providers ("processors") who help us run Era, and only as needed. These currently include:

- **AI model provider (Anthropic)** — to power Ovi's styling suggestions when the AI stylist is active.
- **Cloudflare R2** — to store your clothing images.
- **Neon** — our PostgreSQL database host, where your account and closet records live.
- **Railway** — our application hosting/infrastructure provider.
- **Open-Meteo** — a third-party weather API we query with your coarse location to fetch local weather. We send only the rounded location needed for the lookup.
- **Email provider** — [EMAIL PROVIDER] — to send magic-link sign-in and account emails.
- **Analytics provider (PostHog)** — for privacy-friendly product analytics. We use an EU-hosted, privacy-forward configuration: no broad autocapture, and events are tied only to identified accounts. *(Currently dormant and limited.)*
- **Error diagnostics (Sentry)** — to capture error and crash reports so we can find and fix problems. It's configured not to capture personal data by default, so error reports don't include your closet content or other personal information.

We may also disclose information if required by law, to enforce our terms, or to protect the rights, safety, and security of Era, our users, or the public. If Era is ever involved in a merger, acquisition, or sale of assets, information may be transferred as part of that transaction; we'll let you know if your data becomes subject to a different privacy policy.

## Public content (when you make your closet public)

Your closet is **private by default**. If you turn on the public setting for your closet (in Settings), the cutout images of your items and your outfit cover images are served at **publicly accessible web addresses** — anyone with the link can view them, and no login is required. This is what makes a public closet shareable. You stay in control: switching your closet back to private stops those images from being served publicly going forward. If you never make your closet public, these images are not exposed this way.

<!-- [SOCIAL FEATURES] — pre-launch placeholder. Era is building social features (public profiles with username, display name, and avatar, plus follower/following connections). These are NOT live in the current build and are disclosed here for transparency only. Before any social feature ships, replace this note with an accurate description of what becomes public and update the relevant sections above. -->
We're also building social features — for example, public profiles and the ability to follow other members. **These are not available yet.** When they launch, we'll update this policy to explain exactly what information becomes visible to others and what choices you'll have.

## International data transfers

Era's providers may process and store data in countries other than the one you live in, including the United States. Where we transfer personal data out of the EEA, UK, or Switzerland, we rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses (and the UK Addendum) or an adequacy decision, so your data stays protected.

## How long we keep data

We keep your information for as long as your account is active, so Era can do its job. Specifically:

- **Account, closet, outfits, eras, wear logs, and style profile** — kept until you delete the item, or until you delete your account.
- **Images in Cloudflare R2** — kept until you delete the item or your account.
- **Coarse location** — not stored; used only for the live weather lookup.
- **Waitlist email and referral data** — kept until you ask us to remove it or, if you become a user, folded into your account.
- **Analytics events** — kept in a privacy-friendly form for a limited period to understand product trends.
- **AI usage and cost metadata** — we log opaque usage counts (for example, how many styling requests an account has made and their cost) to run and budget the service. This never includes your messages or closet content, and it is deleted when you delete your account.

When you delete your account, we immediately and permanently remove your live data — every record and every stored image. For a short period, residual copies may remain in our encrypted database backups (our database host keeps point-in-time backup history so we can recover from failures); these residual copies are purged automatically within [BACKUP WINDOW — confirm against Neon retention; default 30 days] and are not used for any other purpose.

We may retain limited records longer where we have a legal obligation to do so (for example, to resolve disputes or comply with law), but only for as long as necessary.

## Your rights and choices

You can access and edit most of your information directly in the app.

**Delete everything.** You can permanently delete your account and all associated data at any time from **Settings → Delete account**. This is real and complete: it immediately and irreversibly removes your live data — every record we hold about you and every image you've stored. The only exception is residual copies in our encrypted backups, which are purged automatically within [BACKUP WINDOW — confirm against Neon retention; default 30 days] and are not used for anything else.

Depending on where you live, you also have some or all of the following rights:

### If you're in the EU, UK, EEA, or Switzerland (GDPR)

- Access a copy of your personal data.
- Correct inaccurate data.
- Delete your data ("right to be forgotten").
- Restrict or object to certain processing.
- Data portability — receive your data in a portable format.
- Withdraw consent at any time (for example, revoke location access).
- Lodge a complaint with your local data protection authority.

### If you're in California (CCPA/CPRA)

- Know what personal information we collect, use, and disclose.
- Access and delete your personal information.
- Correct inaccurate personal information.
- Opt out of "sale" or "sharing" of personal information — note that **we do not sell or share your personal information** as those terms are defined by California law.
- Not be discriminated against for exercising your rights.

To exercise any right, use the in-app controls or email support@era.style. We'll verify your request (usually via your account email) and respond within the timeframes the law requires. You may use an authorized agent where the law allows.

## Children and age

Era is not directed at children and is not intended for them. You must meet the minimum age to use Era in your country — generally **13**, and **16** in parts of the EU where local law sets a higher age for consent to data processing. If we learn we've collected personal data from a child below the applicable age without proper consent, we'll delete it. If you believe a child has given us their information, email support@era.style.

## Security

We take reasonable technical and organizational measures to protect your information, including encryption in transit, access controls, and reputable infrastructure providers. Your images are stored in Cloudflare R2 and your records in a managed Postgres database (Neon). No system is perfectly secure, but we work to keep your wardrobe private and safe, and we'll notify you and the relevant authorities of a data breach where the law requires.

## Changes to this policy

We may update this policy as Era grows — for example, when Ovi's AI features go live or when we add sign-in options. If we make material changes, we'll update the "Last updated" date and, where appropriate, notify you in the app or by email. Continued use of Era after an update means you accept the revised policy.

## Contact us

Questions, requests, or concerns about privacy? Email us at support@era.style *(placeholder — to be confirmed)*.

Data controller: [ERA LEGAL ENTITY].
