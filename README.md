# Land Broker — Cline Hackathon

## Frontend — integrated local page previews

The LandShield homepage is implemented in `frontend/` using React and Vite. It includes the responsive hero, property-verification artwork, feature highlights, and desktop/mobile navigation without branding.

```sh
cd frontend
npm ci
npm run dev
```

Requires Node.js 20.19+ or 22.12+.

### Validation

```sh
npm test
npm run build
```

See [frontend/README.md](frontend/README.md) for browser checks and asset preparation instructions. Root PNG files are the original artwork used by the preparation script; served copies are in `frontend/public/assets/`.

Pages 2 and 3 add responsive login/register (`#signin`) and profile/identity evidence (`#profile`) previews. Homepage Sign In, Get Started, Demo, and Try Demo lead to the account page. Buying/selling context, form validation, sample evidence selection, draft, and review confirmation work locally. Passwords are discarded, and account details/files remain only in memory. Nothing is sent to a backend; there is no real authentication, identity approval, or government integration. Use synthetic data only.

Pages 6 and 7 add listing verification/management and buyer requests at `/page-6` and `/page-7`. They default to local demo; explicit seller API mode is documented in [frontend/PAGES_6_7.md](frontend/PAGES_6_7.md) and still requires an actual authenticated backend session and authorised eligibility data.

Pages 12 and 13 add agreement/registration preparation and cancellation/hold resolution at `/page-12` and `/page-13`. They are independent local synthetic previews, with no live backend commands, payments, government registration or ownership transfer. See [frontend/PAGES_12_13.md](frontend/PAGES_12_13.md). Existing homepage and account pages are preserved.

Teammates' seller dashboard/listing wizard, buyer marketplace/land detail, and outcome/reviewer/registrar pages are also preserved at their hash routes. See [frontend/README.md](frontend/README.md) for the combined routing and local-demo boundaries. No page grants real review authority or performs government registration.

## Synthetic marketplace backend

The FastAPI/PostgreSQL backend is in `backend/`, supporting seller, buyer, assigned reviewer and registrar demonstration workflows. The frontend homepage above has **not yet been connected** to these backend workflows.

**DEMONSTRATION — SIMULATED GOVERNMENT RECORDS.** Accounts, geographic codes, documents, registry checks, registration events and policy decisions are synthetic. This is not a government service, legal/title guarantee, payment system or production deployment.

- [Backend setup, demo accounts and page/API mapping](backend/README.md)
- [Cline SDK helper setup and limitations](backend/ai_worker/README.md)
- [Backend validation record](backend/VALIDATION.md)
- [Actual exported OpenAPI contract](contracts/openapi.json)

Backend API base: `http://localhost:8000/api/v1`; interactive documentation: `http://localhost:8000/docs`. Start the API and worker separately as documented in the backend guide. Use matching frontend/API hosts and credentialed requests; cookie sessions, CSRF, idempotency keys and resource versions are enforced.

The official `@cline/sdk` **0.0.92** document helper is implemented with tools, agent spawning and agent teams disabled. It extracts evidence; deterministic backend rules and assigned reviewers still control publication and transaction decisions. Government integration remains SIMULATED regardless of model-provider configuration.

Provider/model access is **not configured or live-quality verified**. Add credentials only to the ignored `backend/.env`, never to the frontend, Git or reports. Read the documented unresolved SDK dependency advisories before deployment; this remains a demo, not a production-safe release.

The committed `backend/.venv` was explicitly requested and contains machine-specific Windows/Python binaries. Do not rely on it as a portable environment: recreate dependencies using `backend/pyproject.toml` and `backend/uv.lock`. Node SDK dependencies are recreated from `backend/ai_worker/package-lock.json`; `node_modules` is not committed.

## Frontend/backend contract handoff

Contract revision **0.1** uses `/api/v1`, snake_case, UUIDs, decimal strings and UTC timestamps. Generate frontend types from `contracts/openapi.json`; do not invent competing interfaces or treat synthetic government records as connected services.

Regenerate the actual schema from the current backend:

```sh
cd backend
uv run --locked python -m scripts.export_openapi
```

Use backend-derived `availability`, `allowed_actions`, versions and `blocked_reason`. Acceptance reserves one buyer; cancellation requests do not release land, and agreement/registration submission does not complete a transfer. The SDK helper does not gain approval, ownership or lock-release powers.

Original planning information packs remain in the development workspace; this commit does not upload the supplied PDF/screenshots, database folders, private evidence or generated sample documents. Synthetic samples can be regenerated through the documented scripts.

## Buyer pages 10 and 11

Buyer dashboard and transaction workspace are available at /page-10 and /page-11. See [setup and integration boundaries](frontend/PAGES_10_11.md). Includes request filters, evidence summaries, decision gating, cancellation holds and responsive navigation. This is an interactive local demo; full backend wiring remains outstanding.

