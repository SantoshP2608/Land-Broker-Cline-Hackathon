# Land Broker — Cline Hackathon

## Frontend — pages 1–3

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
