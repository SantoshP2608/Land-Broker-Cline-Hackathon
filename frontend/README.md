# LandShield frontend

React + JSX + Vite implementation of the supplied homepage, login/register, profile/identity-verification, seller, agreement and cancellation designs. Account and transaction pages are local demos. Seller pages default to demo and expose an explicit API mode with documented integration limitations.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173).

## Pages and scope

- Homepage: responsive hero and unbranded navbar. Mobile menu supports Escape, outside click, and close after navigation.
- `#signin`: branded login/register preview, buying/selling radio selection, password visibility, required-field validation, and help/privacy dialogs. Homepage Sign In, Get Started, Demo, and Try Demo open this page.
- `#profile`: responsive dashboard/sidebar, editable personal details, document selection, sample-only consent, in-memory draft, review confirmation, status summary, and demo privacy card.
- Direct `#profile` is a **public synthetic preview**, not an authenticated route. Login/register merely enter the frontend demo; they do not create a real account or session.
- Use a sample email and a made-up password (at least eight characters). Passwords are discarded on continuation, not stored or transmitted. No Remember Me option is presented because persistence is not implemented.
- Sample evidence accepts PDF/JPG/PNG up to 10 MB; local checks are not a substitute for server-side validation. Files remain in memory and are never uploaded to public assets or a backend.
- Draft and review completion are local-only. No reviewer decision or confirmed identity is fabricated. Refresh/sign out clears the account preview. Marketplace, settings, recovery, and government integration remain unconnected and explain this in dialogs.
- `/page-2` and `/signin` alias the account preview; `/page-3` and `/profile` alias the profile preview. Existing hash routes and homepage account entry points are preserved.
- `/page-6`: listing verification/management; `/page-7`: buyer requests. See [PAGES_6_7.md](PAGES_6_7.md) for the explicit API configuration and eligibility boundaries.
- `/page-12`: agreement/registration preparation; `/page-13`: cancellation/hold resolution. See [PAGES_12_13.md](PAGES_12_13.md) for local interactions and backend boundaries. Both are independent synthetic fixtures; they never perform payments, registration or ownership transfer.
- `/transactions` provides a local transaction-stage chooser. About and the account Transactions preview dialog link to the seller and transaction pages. Account demo continuation is not a backend session and does not authorise seller API commands.
- No new runtime libraries, external fonts, or icon dependencies.

## Validation

```sh
npm test
npm run build
```

Optional real-browser checks use Playwright and installed Microsoft Edge:

```sh
npm install --no-save --package-lock=false playwright
node scripts/check_home_browser.mjs
node scripts/check_account_browser.mjs
node scripts/check_seller_browser.mjs
node scripts/check_transaction_browser.mjs
node scripts/check_integrated_browser.mjs
```

Checks cover mobile/desktop layouts, account, seller and transaction interactions, and navigation across integrated pages. Run account and seller checks sequentially: both use port 5180. Screenshots are written to ignored `artifacts/`. Optional Playwright is not added to the package manifest or lockfile.

Edge checks disable extensions. The account check separately reports external non-GET traffic from system-installed browser filtering; its no-mutation assertion covers the application origin. This environment traffic is not evidence of an application backend call.

## Artwork

Uploaded originals are left unchanged. Served copies live in `frontend/public/assets/`. The two supplied cyan icons are used for evidence upload and demo privacy. The account backgrounds use a scenic crop from the supplied second-page design, excluding its text and form; the profile copy places the house on the right.

To regenerate assets (Python + Pillow required):

```sh
python scripts/prepare_home_assets.py
python scripts/prepare_account_assets.py
```

Private identity/property evidence must never be placed in public assets. All prototype records must remain synthetic and labelled simulated; document comparison does not guarantee legal title.
