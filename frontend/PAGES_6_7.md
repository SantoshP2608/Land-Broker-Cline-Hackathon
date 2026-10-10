# Seller pages 6 and 7 — local handoff

Originally implemented in `D:\Cline_AI_CodeAlchemists\Final_code\frontend`; integrated for publication in `D:\Cline_AI_CodeAlchemists\publish-Land-Broker-Cline-Hackathon\frontend`. Existing homepage and teammates' account/profile pages are preserved. Pages 4–5 remain outside this implementation.

## Run

Requires Node 20.19+ or 22.12+.

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\publish-Land-Broker-Cline-Hackathon\frontend'
npm.cmd ci
npm.cmd run dev
```

- Page 6: `http://127.0.0.1:5173/page-6`
- Page 7: `http://127.0.0.1:5173/page-7`
- Homepage remains `/`; Try Demo preserves the account flow. About and the account Transactions preview dialog link to the seller/transaction pages.
- Canonical routes: `/seller/listings/LS-2041` and `/seller/buyer-requests`.
- Other routes show an explicit integration handoff, not fake completed pages.

## Implemented interactions

**Page 6 — Listing Verification & Management:** three evidence findings, private source-reference dialog, review stages/timeline, typed correction-file selection, filename/MIME/10 MB/empty-file validation, file removal, submit confirmation, edit form, publication guard, loading/error/retry states. Backend upload still validates actual signatures. Each file has a document-type selector. Updates/corrections never imply approval.

**Page 7 — Buyer Requests:** live counts, keyboard-accessible status tabs, listing filter, buyer search, selectable requests, selected-request details, pending/unknown/failed identity labels, confirm accept/decline dialogs, parcel reservation and competing-acceptance guard, accepted transactions handoff, loading/error/empty states. Acceptance starts a discussion; it does not transfer ownership.

Both screens use responsive dark/cyan glass styling, supplied public design artwork, accessible native dialogs, keyboard focus, reduced-motion styles, and visible simulated-government notices. Visible data refreshes every 10 seconds and on focus; timers are removed on unmount. No private files or identity data are stored in localStorage or copied into public assets.

## Merge into your friends' frontend

Copy `src/features/seller/`, `public/assets/seller/`, and the seller tests. The existing app is React 19 + Vite with JSX and plain CSS; no router/icon/CSS framework dependencies were introduced. The temporary standalone App routing can be replaced by your shared router.

```jsx
import ListingManagement from './features/seller/ListingManagement.jsx';
import BuyerRequests from './features/seller/BuyerRequests.jsx';
import SellerLayout from './features/seller/SellerLayout.jsx';
import { createSellerService } from './features/seller/seller-service.mjs';

// Create one stable service for the session, not a new service every render.
const service = createSellerService({ mode: 'demo' });
```

Page 6 receives `{ service, listingId }`; page 7 receives `{ service, onNavigate }`. Shared layout receives `{ path, onNavigate, mode, children }`. If teammates already own the seller header/sidebar, render just the page content and import `SellerLayout.css` for shared `ls-*` controls, or consolidate those styles in your shared design system.

Screenshot fixtures retain Visakhapatnam/Bheemili names to match the supplied design. They are **synthetic visual preview data**, not Karnataka backend records. API mode displays the actual Karnataka record fields and UUIDs; do not submit the design's LS/BR IDs to the backend.

## Explicit backend mode

Copy `.env.example` to ignored `.env.local` and set `VITE_SELLER_MODE=api`. Leave `VITE_API_BASE_URL` blank to use the local Vite proxy configured in `vite.config.mjs`. Restart Vite after configuration changes. Backend must run separately on port 8000. An authenticated citizen session must already exist from the team's login page; these pages do not collect login credentials. Production requires a same-origin reverse proxy or correctly configured credentialed CORS/CSRF origins; Vite's proxy is development-only.

The service uses `/api/v1`, `/auth/session`, credentialed cookies, real session CSRF, server `allowed_actions`, current integer versions, parcel version plus invitation version on acceptance, and per-command UUID idempotency keys. Decimal money is kept as strings. Transport failures never switch to demo. Conflict refetches show the authoritative state and require another deliberate action.

### Current integration boundaries

- Actual invitation DTO lacks buyer display name, note, and identity status. API mode displays a buyer ID label, no note, and **eligibility unavailable**. Acceptance is intentionally blocked until the backend supplies authorised confirmed buyer eligibility; it is not inferred from an action or invented. Decline remains available when authorised. No backend contract was changed in this task.
- Actual listing DTO lacks update timestamps and historical review events. API mode shows date unavailable/current review rather than fabricated audit history.
- Evidence values/pages are available; displayed `field: value` citations are not claimed as verbatim OCR source quotes. Documents remain private and any download grant remains session-bound.
- Uploads are sequential and acknowledged by the backend before submission. Partial failure reports saved documents; there is no rollback/delete API. Retry an **unchanged batch with the original version** to resume. The UI freezes a started batch and preserves its original version. Do not reload mid-uncertain command: idempotency keys/batch state are in-memory for the service lifetime, not durable across reloads. Check authoritative records after a reload before any new command.
- Full authenticated live-backend browser integration is not implemented or tested. API transport/permissions/version/retry behavior is covered by mocked-contract tests, not a claim of end-to-end live integration. Account previews do not establish backend sessions.

## Validation

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\publish-Land-Broker-Cline-Hackathon\frontend'
npm.cmd test
npm.cmd run build
# Optional development-only browser tests; installed Edge required:
npm.cmd install --no-save --package-lock=false playwright
node scripts/check_seller_browser.mjs
node scripts/check_home_browser.mjs
```

Validated: **39 automated tests**, production build, real Edge checks for both seller pages at 1600/1280/1024/768/390/320px, plus homepage checks at seven widths. Seller browser checks exercise file rejection, evidence modal, uploads/review, edit/approval invalidation, search/empty states, identity gate, acceptance and competing locks. No browser runtime errors. Optional Playwright is not added to the package manifest/lockfile. Screenshots are in ignored `artifacts/`.

Public parcel images are cropped from supplied screenshot artwork. Decorative landscape is reconstructed from UI-free regions, so it is not an exact full-resolution original background. All text, buttons and controls are live HTML/React, not a clickable full-page screenshot. To regenerate assets (Python/Pillow required):

```powershell
& 'D:\Cline_AI_CodeAlchemists\Final_code\backend\.venv\Scripts\python.exe' 'D:\Cline_AI_CodeAlchemists\Final_code\frontend\scripts\prepare_seller_assets.py' --downloads 'C:\Users\ASUS\Downloads'
```