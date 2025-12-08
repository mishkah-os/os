# SBN UI/UX Audit (Mostamal Hawaa)

## What is implemented
- **Post composer coverage**: Users can publish plain posts or reels, and attach classifieds, products, services, wiki articles, or ads. The composer already switches form fields based on attachment type (e.g., classifieds show title/price/phone inputs, while product/service/wiki trigger target pickers).【F:static/projects/sbn/app.js†L1418-L1541】
- **Media handling in posts**: Reels render with video controls and posters when available, while non-reel posts display up to three media thumbnails inside feed cards.【F:static/projects/sbn/app.js†L2171-L2188】
- **Attachment rendering in feed**: Shared attachments resolve to their card renderers for products, services, wiki articles, classifieds, or ad link previews, ensuring the feed shows a consistent attachment block beneath the text.【F:static/projects/sbn/app.js†L2223-L2279】
- **Commerce/service surfacing**: The home timeline stacks hero, quick actions, composer, social feed, classifieds spotlight, trending chips, metrics, category showcase, and featured carousels for products, services, and knowledge articles.【F:static/projects/sbn/app.js†L2515-L2557】
- **Launch readiness layer**: A persisted launch checklist card sits under the onboarding block to track composer, attachment details, profile tabs, discovery filters، and safety/reporting tests with quick shortcuts to each flow.【F:static/projects/sbn/app.js†L1852-L1894】【F:static/projects/sbn/app.js†L1870-L1894】

## Gaps and UX debt
- **Fine-grain media polish**: Galleries and detail sheets are wired, but reel-only swipe mode and inline media reordering/captions are still future niceties.
- **Deep article reading**: Knowledge cards open with clearer covers and titles, yet a paginated reader (font controls, estimated read time) remains a potential enhancement.
- **Motion and performance**: Animations are intentionally minimal; add lazy-loading and skeletons if we notice jank on very low-end devices.

## Recommendations to reach a complete user journey
1. **End-to-end posting flow**
   - Extend media uploads to support image reordering/captions for plain posts and classifieds when bandwidth allows.
2. **Gallery/detail experiences**
   - Iterate on product/service detail sheets with spec tables and comparison toggles for buyers.
   - Provide a knowledge article reader page with typography controls and related-articles navigation.
3. **Timeline and discovery**
   - Consider a dedicated reels-only swipe mode once performance profiling is complete.
   - Add lazy-loading with skeleton states to keep filtered tabs responsive on older devices.
