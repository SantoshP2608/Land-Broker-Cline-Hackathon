# Demo backend validation record

## Cline SDK integration update (2026-10-10, moved project under Final_code)

- Official registry latest stable checked: `@cline/sdk` **0.0.92**, pinned in `ai_worker/package.json` + lockfile. Node24.12.0.
- Full Python suite: **53 passed**, 1 existing Starlette/httpx deprecation warning,69.60s.
- Node helper tests: **16 passed**,0 failed,9.24s after final explicit SQLite-disposal hardening. Three actual Python/SDK subprocess tests rerun after that change:3 passed.
- Actual SDK `ClineCore.create/start` runs against a local **mocked model HTTP gateway**. Full Python subprocess→Node→official SDK→mock gateway→validated evidence test also passes. This is real SDK orchestration, not a live paid-model extraction-quality check.
- Actual no-model readiness probe imports SDK and safely reports missing CLINE_PROVIDER_ID, CLINE_MODEL_ID, CLINE_API_KEY. No personal IDE credentials are borrowed.
- Opt-in live smoke script stopped with `SDK_NOT_CONFIGURED`; **no real model extraction or credits access has been verified**.
- Synthetic government mode and public contract0.1 remain unchanged. Actual exported OpenAPI52 paths54 operations; no schema migrations required, Alembic check no drift.
- Python lint/format/compile pass. Existing 34 regressions still pass; added SDK failure/no-fallback, quote/page/normalization/privacy, model-policy fencing, document changes during extraction, and actual SDK runner/gateway checks.
- `npm audit --omit=dev`: **34 affected-package advisories** (4critical14high11moderate5low). Non-forced audit fix did not clear them. Includes upstream transitive git/provider dependencies. Tools/checkpoints/spawn/teams/plugins disabled; risk is not eliminated. **Not production-safe.**
- SDK extraction is default; explicit SIMULATED mode is used by offline regression tests. Existing seeded reviews are fixtures, not claims of SDK processing. New evidence requires configured SDK provider and new review.

The original pre-SDK record below is historical; its empty-folder/no-SDK statements no longer describe the current build.

## Original pre-SDK backend checkpoint

Validated locally on 2026-10-10, Windows, Python 3.14.2, PostgreSQL 18.

- Entire suite: **34 passed**, 1 dependency deprecation warning, 46.29 seconds.
- 27 API/integration/concurrency tests use isolated real PostgreSQL `land_demo_test` on port55432.
- 7 focused workflow/unit tests use disposable in-memory SQLite; these do not establish concurrency guarantees.
- `ruff check app scripts tests`: all checks passed.
- `ruff format --check app scripts tests`: 34 files already formatted.
- `compileall` application/scripts/migrations/tests: passed.
- Alembic upgrade from empty demo database: `001_initial` (head).
- Alembic schema comparison: no new upgrade operations detected.
- Seed CLI twice: preserved synthetic fixtures without duplication.
- Live HTTP health, marketplace and OpenAPI: checked at localhost:8000.
- Actual OpenAPI export matches application: 52 paths, 54 operations, typed responses and cookie/header documentation.
- Original shared contracts/fixtures still match between supplied packs; fixtures JSON parses.
- SDK package not installed; `backend/ai_worker` exists and is empty.
- 17 generated upload samples parse as real synthetic PDFs (not official documents).

Covered: successful simulated transfer with terms/draft/both confirmations, safe early cancellation with explicit republish and buyer-B acceptance, disputed hold, A/B acceptance race, duplicate same-key concurrency, stale versions, object privacy/CSRF, signed/expired/duplicate/partial official events, terms invalidation, upload/worker/review/publication, stale verification jobs, new-user identity review, retryable registry failure and completion/release race.

Known test warning: installed Starlette deprecates its httpx-backed TestClient in favor of httpx2. Current tests pass using the locked httpx dependency; no additional testing dependency was silently added.

No frontend code was available, so combined browser/UI integration is **not validated**. No Git commit exists in this workspace. This record does not establish production readiness, actual AI capability, government integration or legal compliance. Read the backend README for remaining roadmap work and demo-only security limitations.