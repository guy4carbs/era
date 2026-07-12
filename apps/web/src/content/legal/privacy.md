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
- Era's **Shop** tab suggests products that fit your closet — ranked on our own servers by default, or (if AI ranking is on) with a text-only summary of your closet and style profile sent to our AI provider, never your photos. Shop links are affiliate links, and **commissions never affect the ranking**.
- **Era+** is an optional paid subscription. Payments are handled by Stripe (web) or Apple (iOS) and processed for us by RevenueCat — **we never see or store your card number**. We keep only your plan and its status, and that record is deleted with your account.
- You can delete your account and everything in it at any time from **Settings → Delete account**. We immediately and permanently remove your live data — every record and every image you've stored — and any residual copies in our encrypted backups are purged automatically shortly after.
- Your closet is **private by default**. If you choose to make it public, your item cutout images and outfit covers become viewable at public web links (no login needed) until you switch it back to private.

## Who this applies to

Era is intended for people who are old enough to use it under the law where they live (see [Children and age](#children-and-age)). It is not directed at children.

## Information we collect

### Information you give us

- **Account information.** Your email address, which we use to sign you in with a magic link. We plan to add Apple and Google sign-in; if you use those, the provider shares a limited identifier and your email with us so we can create or match your account.
- **Waitlist information.** If you join our waitlist before you have an account, we collect your email address and, optionally, referral attribution (for example, who referred you or which link you came from).
- **Closet data.** Photos of your clothing that you upload or import from a product link, and details about those items. When you add an item, our AI extracts attributes such as category, color, pattern, and brand to help organize your closet. You can also import items by forwarding or pasting a retailer order-confirmation email. When you do, we parse only the purchased garments' details — name, brand, price, and product image — and discard the rest: Era itself does not store the email or the other information it may contain, such as your shipping address, order number, or payment details. When you forward an email to your private import address, it passes through and is temporarily stored by our email provider (Resend) before we retrieve and parse it — see [Who we share data with](#who-we-share-data-with).
- **Outfits and eras.** The outfits you compose and the "eras" (style chapters) you create.
- **Wear logs.** Records of when you wear items or outfits, if you choose to log them.
- **Saved products (your wishlist).** When you save a product from the **Shop** tab to come back to later, we store a snapshot of it — the item, the retailer, and its price at the moment you saved it — so you can find it again.
- **Notification preferences and channels.** If you turn on notifications (for example, price-drop alerts on the pieces you've saved), we store your preferences and the channel you opted into: your email address (already on file) and/or a device push token you grant so we can send you a push notification. Each channel is opt-in on its own, and you can turn any of them off at any time.
- **Style profile.** Answers to a short style quiz, which we use to build a taste model (for example, a style archetype and color palette).

### Information we generate or collect automatically

- **AI-extracted attributes.** The clothing attributes described above, produced automatically when you add an item by sending its photo to our AI provider (Anthropic) for analysis — whether you add a single photo, several garments in one flat-lay photo, or import from a link or receipt.
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
| Process Era+ subscriptions and payments | To provide the paid features you signed up for | Performance of a contract |
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

## Shopping suggestions (the Shop tab)

Era's Shop tab suggests cross-brand products that fit the wardrobe you already have — Ovi's "shop your closet first" rule pointed outward. Here's how it handles your data.

- **How products are ranked.** By default, Era ranks products with a deterministic (rule-based) engine that runs entirely on our own servers — **nothing about you is sent to a third party** to produce the ranking. If AI ranking is active, Era sends a **compact, text-only view of your closet** — item categories, colors, and brands, **not your photos** — together with your style profile to our AI provider (Anthropic) to score how well each product fits you. We do not use this to train models on your data, we ask Anthropic not to train their general models on it, and we do not sell it. The AI ranking path is **currently dormant**; today the deterministic engine does the ranking, and in that mode Shop sends nothing about you to an AI provider.
- **When you tap out to a retailer.** Product links in Shop are **affiliate links**, so Era may earn a commission if you buy — see our [Terms](/terms#7-third-party-links-brands-and-shopping) for the full disclosure, including our promise that commissions never affect how Ovi ranks anything. To improve future suggestions, we log that you opened or dismissed a pick — the product, the retailer, and the honest reason label the card showed — and this record holds **no personal information about you**. We don't share your personal information with retailers: the only thing that travels with an affiliate link is a standard, non-identifying affiliate sub-id used to attribute the click.
- **Saving products for later (your wishlist).** You can save products from Shop to a wishlist so you can find them again. When you save one, we store a snapshot of it — the item, the retailer, and its price at the moment you saved it.
- **Price-drop alerts (off by default).** If you turn on price alerts, Era periodically re-checks the price of the pieces you've saved — by looking up the retailer's public product page — and notifies you when one drops. This is **opt-in and off by default**, it only watches pieces you've saved, and you can turn it off at any time. Alerts reach you through the channels you've enabled: your email (sent via our email provider) and/or a push notification to a device you've granted a push token for, each opt-in on its own.

## Era+ subscriptions and payments

Era+ is an optional paid subscription. The core app is free; Era+ unlocks additional features. You never have to subscribe, and you can cancel at any time. Here's how Era+ handles your data.

- **How you pay.** On the web, your payment is processed by **Stripe**; on iOS, by **Apple** through the App Store. Era never sees or stores your card number or other full payment details — those go directly to the payment processor, which handles them under its own security standards.
- **How we keep your subscription in sync (RevenueCat).** We use **RevenueCat**, a subscription-management processor, to track your subscription status across platforms. When you subscribe, RevenueCat receives an app user identifier (your Era account id) and the purchase details — the plan and its status — so it can tell our servers whether your Era+ access is active. RevenueCat acts on our behalf and does **not** receive your card number.
- **What we store.** On our own servers we keep a small record of your subscription so we can grant Era+ access: the plan you chose, its status (active, renewing, expired, or in a billing-retry period), the relevant dates (when it started and when it renews or expires), which store processed it, and — for web subscriptions — the Stripe customer reference used to open your billing portal. We do **not** store your card number or full payment details.
- **Deleting your subscription data.** The subscription record we hold is tied to your account and is **deleted when you delete your account**. The payment processors — Stripe, Apple, and RevenueCat — keep their own records of your transactions under their respective privacy policies and as the law requires (for example, for tax and accounting); that processor-side history is governed by their policies and is not deleted by Era. Deleting your Era account does **not** automatically cancel an active paid subscription — to stop future charges, cancel it first (in the app, through your Apple account, or via the web billing portal).

## Who we share data with

We don't sell your personal information. We share it only with service providers ("processors") who help us run Era, and only as needed. These currently include:

- **AI model provider (Anthropic)** — to power Ovi's styling suggestions when the AI stylist is active, and to analyze the photos you add to your closet so we can extract each item's attributes (category, color, pattern, brand).
- **Cloudflare R2** — to store your clothing images.
- **Neon** — our PostgreSQL database host, where your account and closet records live.
- **Railway** — our application hosting/infrastructure provider.
- **Affiliate network** — when the Shop tab's live affiliate feed is enabled, to source shoppable products and attribute your clicks so Era can earn a commission. We pass only a standard, non-identifying affiliate sub-id — never your personal information. *(Currently dormant — today Shop runs on a built-in sample catalog.)* We will name the specific network here once the live feed is enabled.
- **Open-Meteo** — a third-party weather API we query with your coarse location to fetch local weather. We send only the rounded location needed for the lookup.
- **Email provider** — Resend — to send magic-link sign-in and account emails, to hold waitlist signups on a contact list for launch announcements, and to receive the receipt emails you forward to your private import address. An email you forward passes through and is stored by Resend before Era retrieves and parses it; Era itself keeps only the parsed garment details (see [Information you give us](#information-you-give-us)).
- **Payment processors (Stripe and Apple)** — to process Era+ subscription payments. Stripe handles web payments; Apple handles in-app purchases on iOS. They receive your payment details directly; Era never sees or stores your card number. *(Era+ is dormant until enabled.)*
- **Subscription management (RevenueCat)** — to track and reconcile your Era+ subscription status across platforms. RevenueCat receives your Era account id (as an app user identifier) and your purchase details (plan and status), never your card number. *(Era+ is dormant until enabled.)*
- **Analytics provider (PostHog)** — for privacy-friendly product analytics. We use an EU-hosted, privacy-forward configuration: no broad autocapture, and events are tied only to identified accounts. *(Currently dormant and limited.)*
- **Error diagnostics (Sentry)** — to capture error and crash reports so we can find and fix problems. It's configured not to capture personal data by default, so error reports don't include your closet content or other personal information.

We may also disclose information if required by law, to enforce our terms, or to protect the rights, safety, and security of Era, our users, or the public. If Era is ever involved in a merger, acquisition, or sale of assets, information may be transferred as part of that transaction; we'll let you know if your data becomes subject to a different privacy policy.

## Public content (when you make your closet public)

Your closet is **private by default**. If you turn on the public setting for your closet (in Settings), the cutout images of your items and your outfit cover images are served at **publicly accessible web addresses** — anyone with the link can view them, and no login is required. This is what makes a public closet shareable. You stay in control: switching your closet back to private stops those images from being served publicly going forward. If you never make your closet public, these images are not exposed this way.

**Public profile pages.** If your closet is public, Era gives you a profile page at `era.style/your-username`. It shows your username, display name, avatar, your closet's cutout images, your eras and outfit covers, and your follower and following **counts**. Anyone on the web can view this page without logging in, and public profiles with five or more items may be **indexed by search engines** (we include them in our sitemap and mark them up for search results). If your closet is private, your profile page shows only your username, display name, avatar, and follower count — never your closet — and is marked not to be indexed. Switching back to private takes effect immediately on the page itself and in our sitemap; search engines remove already-indexed pages on their own schedule.

**Following.** Members can follow each other. Who you follow and who follows you is personal data; today Era shows only the **numbers** (follower and following counts) on profile pages — not the lists of accounts behind them. Follow relationships are deleted when either account is deleted.

## International data transfers

Era's providers may process and store data in countries other than the one you live in, including the United States. Where we transfer personal data out of the EEA, UK, or Switzerland, we rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses (and the UK Addendum) or an adequacy decision, so your data stays protected.

## How long we keep data

We keep your information for as long as your account is active, so Era can do its job. Specifically:

- **Account, closet, outfits, eras, wear logs, and style profile** — kept until you delete the item, or until you delete your account.
- **Saved products, notification preferences, push tokens, and in-app notifications** — kept while your account is active; they cascade off automatically when you delete your account.
- **Era+ subscription record** — the plan, status, and dates we cache to grant Era+ access — kept while your account is active and deleted when you delete your account. The payment processors (Stripe, Apple, RevenueCat) retain their own transaction records under their policies and as the law requires; that history is not ours to delete.
- **Images in Cloudflare R2** — kept until you delete the item or your account.
- **Coarse location** — not stored; used only for the live weather lookup.
- **Waitlist email and referral data** — kept until you ask us to remove it or, if you become a user, folded into your account.
- **Analytics events** — kept in a privacy-friendly form for a limited period to understand product trends.
- **AI usage and cost metadata** — we log opaque usage counts (for example, how many styling requests an account has made and their cost) to run and budget the service. This never includes your messages or closet content, and it is deleted when you delete your account.

When you delete your account, we immediately and permanently remove your live data — every record and every stored image. For a short period, residual copies may remain in our encrypted database backups (our database host keeps point-in-time backup history so we can recover from failures); these residual copies are purged automatically within [BACKUP WINDOW — confirm against Neon retention; default 30 days] and are not used for any other purpose.

We may retain limited records longer where we have a legal obligation to do so (for example, to resolve disputes or comply with law), but only for as long as necessary.

## Your rights and choices

You can access and edit most of your information directly in the app.

**Delete everything.** You can permanently delete your account and all associated data at any time from **Settings → Delete account**. This is real and complete: it immediately and irreversibly removes your live data — every record we hold about you and every image you've stored. The only exceptions are residual copies in our encrypted backups, which are purged automatically within [BACKUP WINDOW — confirm against Neon retention; default 30 days] and are not used for anything else, and a minimal do-not-contact record — just your email address — kept for any address that has bounced or asked not to be emailed, so we never contact it again.

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
