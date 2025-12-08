# SBN UI/UX Audit (Mostamal Hawaa)

## What is implemented
- **Post composer coverage**: Users can publish plain posts or reels, and attach classifieds, products, services, wiki articles, or ads. The composer already switches form fields based on attachment type (e.g., classifieds show title/price/phone inputs, while product/service/wiki trigger target pickers).【F:static/projects/sbn/app.js†L1418-L1541】
- **Media handling in posts**: Reels render with video controls and posters when available, while non-reel posts display up to three media thumbnails inside feed cards.【F:static/projects/sbn/app.js†L2171-L2188】
- **Attachment rendering in feed**: Shared attachments resolve to their card renderers for products, services, wiki articles, classifieds, or ad link previews, ensuring the feed shows a consistent attachment block beneath the text.【F:static/projects/sbn/app.js†L2223-L2279】
- **Commerce/service surfacing**: The home timeline stacks hero, quick actions, composer, social feed, classifieds spotlight, trending chips, metrics, category showcase, and featured carousels for products, services, and knowledge articles.【F:static/projects/sbn/app.js†L2515-L2557】

## Gaps and UX debt
- **Detail views and galleries**: Product cards only expose the primary image and a compact body; there is no modal/gallery to browse multiple images or specs before sharing or purchasing.【F:static/projects/sbn/app.js†L2477-L2512】
- **Attachment selection clarity**: While attachment options exist, the target selectors are buried after category pickers and lack inline state (e.g., previews or validation) to confirm the chosen product/service/wiki before publishing.【F:static/projects/sbn/app.js†L1418-L1541】【F:static/projects/sbn/app.js†L1528-L1541】
- **Article readability**: Knowledge attachments reuse a generic article item without a dedicated reader layout or typography controls, which keeps long-form content cramped inside feed cards.【F:static/projects/sbn/app.js†L2223-L2251】
- **Navigation depth**: The timeline intermixes social feed, classifieds, marketplace, and knowledge without scoped tabs or filters, so users can’t focus on a single vertical (e.g., only services or only reels) during browsing.【F:static/projects/sbn/app.js†L2515-L2557】

## Recommendations to reach a complete user journey
1. **End-to-end posting flow**
   - Add attachment target previews (thumbnail + title) beside the selectors and block submission until a target is confirmed for product/service/wiki types.
   - For classifieds, add inline validation for phone/price fields and show a preview card before publishing.
   - Extend media uploads to support image galleries with reordering and captions for plain posts and classifieds.
2. **Gallery/detail experiences**
   - Build product and service detail sheets (modal or dedicated route) with image carousel, price breakdown, specs, seller info, and CTA buttons (chat/call/save/share).
   - Provide a knowledge article reader page with improved typography, cover image, and related articles rail.
3. **Timeline and discovery**
   - Introduce top-level tabs or segmented controls to filter Timeline vs. Used Ads vs. Products/Services vs. Knowledge, keeping the current cards but isolating contexts.
   - Add hashtag/category chips that drive filtered feeds rather than static metric blocks.
4. **Lifecycle onboarding**
   - Create a “new user” checklist card in the hero (upload avatar, follow categories, post first item) and surface contextual tooltips explaining attachment types.
   - Ensure the login/register CTA in the composer hero routes correctly and that the composer stays accessible after onboarding.
5. **Reels and media polish**
   - Add swipeable reel mode (full-height cards) with autoplay and mute controls, separate from mixed feed cards.
   - Support multi-video attachments for services/knowledge demonstrations with duration warnings similar to the reel hint.

## Suggested component backlog
- Product/Service Detail Sheet (carousel + specs + actions)
- Knowledge Reader View (article page with related links)
- Attachment Preview Chips for composer (selected target summary + clear button)
- Gallery Manager (multi-image upload, reorder, caption) for posts/classifieds
- Filtered Timeline Tabs (segmented control for each vertical)
- Onboarding Checklist Card + contextual tooltips around attachment dropdowns
- Reel-Only Feed mode with swipe navigation
