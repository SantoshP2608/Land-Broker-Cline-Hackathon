# Synthetic demo backend

FastAPI + synchronous SQLAlchemy + PostgreSQL + Alembic. One service supports the 14 user pages and 2 officer pages. Identity, land records, registration and payments remain synthetic. Document extraction integrates the official Cline SDK; configure provider access to run real model requests.

## Start locally (PowerShell)

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\Final_code\backend'
uv sync --locked --python 'C:\Python314\python.exe'
# Only on a fresh clone; do not overwrite a customized .env:
if (!(Test-Path '.env')) { Copy-Item '.env.example' '.env' }
.\scripts\demo_db.ps1 start
uv run --locked alembic upgrade head
uv run --locked python -m scripts.seed_demo
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Run a worker in a second terminal:

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\Final_code\backend'
uv run --locked python -m app.worker
```

Docs: http://localhost:8000/docs. Base API: http://localhost:8000/api/v1.
The API process started during this build is a local convenience, not a Windows service; use the start command above after restarting your computer. The worker must run separately for newly submitted jobs and notifications.
The original running PostgreSQL instance still uses `D:\Cline_AI_CodeAlchemists\.demo-postgres`, localhost **55432**, databases `land_demo` and `land_demo_test`. A clean stopped snapshot also exists at `D:\Cline_AI_CodeAlchemists\Final_code\.demo-postgres`. Do not run both on the same port; this SDK task does not switch the active cluster. `scripts/demo_db.ps1` now resolves data under the moved project root, so stop the original instance deliberately before starting the copied cluster. Existing PostgreSQL on5432 is untouched. Local trust is for disposable synthetic records only; never expose either cluster on a shared/production machine.

No tables are created/reset automatically when the API starts. Tests reset **only** the `_test` database. Seed is idempotent, not a destructive reset; it preserves completed/active demo history. For a fresh presentation create another dedicated database, update DATABASE_URL, migrate and seed. Never delete transaction history through an API.

## Demo accounts

All passwords: **`DemoPass123!`** — fake local demo credentials only.

| Account | Login |
|---|---|
| Seller | seller@demo.local |
| Buyer A | buyer.a@demo.local |
| Buyer B | buyer.b@demo.local |
| Unrelated citizen | outsider@demo.local |
| Assigned reviewer | reviewer@demo.local |
| Assigned registrar | registrar@demo.local |

Choosing buyer/seller is navigation, not a role. Public registration always creates CITIZEN with PENDING identity. Seeded identities are CONFIRMED **SIMULATED**; newly submitted identities require assigned reviewer confirmation. Officer accounts are seed-provisioned, never selectable at registration.

Synthetic configuration is returned by `/configuration`: state KA, synthetic district `KA-DEMO-D`, subdistrict `KA-DEMO-S`, village `KA-DEMO-V`, surveys 001–004, subdivision A. The unlisted fourth parcel supports the create-listing form. Review checklist: PREVIOUS_DEED, LAND_RECORD, ENCUMBRANCE_CERTIFICATE. This is a demonstration checklist, not a statement of Karnataka law. Units SQM/ACRE/GUNTHA, decimal strings, INR; timestamps UTC, display Asia/Kolkata in the UI.

## Frontend connection

Use matching hosts: **localhost frontend + localhost API**, or **127.0.0.1 + 127.0.0.1**. Mixing hosts can suppress SameSite cookies. Allowed origins default to http://localhost:5173 and http://127.0.0.1:5173. Configure actual exact origins in `.env`; no wildcard credentials CORS.

```typescript
const base = 'http://localhost:8000/api/v1';
const login = await fetch(`${base}/auth/login`, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'seller@demo.local', password: 'DemoPass123!' }),
});
const { data } = await login.json();
// After refresh obtain csrf_token again through GET /auth/session.
const response = await fetch(`${base}/seller/listings/LISTING_UUID/publish`, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrf_token,
    'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ expected_version: currentListing.version }),
});
```

Generate a key once per deliberate command and retain it for timeout retries. Do not regenerate a key for retry. A 409 requires refetch and a new deliberate action. File uploads use FormData and must **not** set Content-Type manually. Downloads require cookies and fresh permission checks; URLs expire.

Always use backend `allowed_actions`, `availability`, versions and `blocked_reason`; the backend independently enforces permissions. Poll private active views every 10 seconds while visible and on focus. Do not show success before the command returns.

## Page/API mapping

| Page | APIs/panels |
|---|---|
| 1 Home/journey | health, configuration, public listings |
| 2 Login/register | auth register/login/session/logout |
| 3 Profile/identity | session, identity me/submissions, documents |
| 4 Seller dashboard | seller listings, invitations per listing, transactions |
| 5 Create/edit listing | configuration, seller listing create/PATCH, document uploads |
| 6 Verification/management | submit-review, job, findings, publish |
| 7 Request inbox | seller listing invitations; accept/decline |
| 8 Marketplace | public listings with district/availability filters |
| 9 Land detail | public detail; create invitation |
| 10 Buyer dashboard | buyer invitations, transactions |
| 11 Transaction workspace | private detail, timeline, structured outcomes, shared documents |
| 12 Agreement/registration | terms, deed, confirmations, registration-submit |
| 13 Cancellation/hold | request/response, case detail, evidence |
| 14 Outcome/report | transaction report and authorized download |
| 15 Reviewer dashboard | assigned queue, identity/listing/cancellation/hold decisions |
| 16 Registrar dashboard | assigned queue, registration decisions, simulate |

Contract 0.1 has no persistent chat, editable profile endpoint, server full-text/price/area filtering, or public photo derivative pipeline. Use structured outcomes/timeline and client-side filters over fetched results for now; agree contract extensions rather than inventing calls. Photo uploads are private; `photo_urls` is currently empty. The configuration object structures and combined `hold_case` / cancellation `parcel` response keys are documented by actual OpenAPI for frontend review.

## Demo stories

1. **Transfer:** first eligible listing → seller accepts A → both record PROCEED → terms → generate draft → each confirms same current hash → registration-submit → assigned registrar simulate → COMPLETED/TRANSFERRED/CLOSED. Old seller cannot reopen it.
2. **Early cancellation:** another listing → accept A → request cancellation → other party AGREE with no commitments → assigned reviewer RELEASE with fresh synthetic registry check → CLOSED_CANCELLED/OPEN. Listing becomes APPROVED; seller explicitly publishes again, then explicitly accepts B. No automatic promotion.
3. **Dispute:** third listing → accept A → cancellation → other party DISAGREE/claimed commitments → HOLD. Evidence/assigned review are available; timer expiry never opens the parcel.

## Cline SDK document analysis

`D:\Cline_AI_CodeAlchemists\Final_code\backend\ai_worker` integrates the pinned official **@cline/sdk 0.0.92** using `ClineCore.create()` and `start()`. Node24 is required by this helper (the SDK itself declares22+). No public API paths, enums or DTOs change.

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\Final_code\backend\ai_worker'
npm ci
npm test
Set-Location 'D:\Cline_AI_CodeAlchemists\Final_code\backend'
uv run --locked python -m scripts.check_cline_sdk
```

Configure the ignored `D:\Cline_AI_CodeAlchemists\Final_code\backend\.env`:

- `DOCUMENT_EXTRACTION_BACKEND=CLINE_SDK` (default).
- `CLINE_PROVIDER_ID`: `anthropic`, `openai`, `openrouter`, or `ollama`.
- `CLINE_MODEL_ID`: the exact model identifier available under your provider/organizer access.
- `CLINE_API_KEY`: provider key; optional only for configured local Ollama. **Never put it in frontend code, Git, chat, reports or logs.**
- `CLINE_BASE_URL`: optional explicit provider-compatible endpoint. The SDK's `openai` alias uses its OpenAI-compatible handler; use a compatible `/v1` base URL when your access instructions specify one.
- `CLINE_TIMEOUT_SECONDS=60` (maximum120), `CLINE_MIN_CONFIDENCE=0.80` (model confidence is uncalibrated; not a legal certainty).

The readiness check imports the actual SDK but makes **no model call**. Missing configuration is reported using environment-variable names only. The application does not borrow your IDE/Cline login or organizer credits automatically. Provider access must be configured explicitly; organizer account/API compatibility remains to be checked.

Restart API/worker after changing settings. Then submit a new document review using the existing upload/submit-review/job/findings APIs. Each required synthetic text document is parsed into 1-based pages by the existing isolated PDF parser, then sent as text to a no-tools SDK session. JSON fields are validated against the exact source page/quote; deterministic Python compares readings to simulated registry records. Reviewer approval is still separate. Government identity/records/registration remain **SIMULATED**, even though the extraction model is real.

No tools, shell commands, file access tools, agent spawning, agent teams, plugins, MCP settings or automation are enabled. The helper receives no DB/session/simulator credentials. Temporary SDK state and transcripts are deleted after each run; provider-side retention still depends on that provider. Only synthetic documents may be sent in this demo. Scans/images without extractable text require manual review: no native PDF model input, image OCR or multilingual quality guarantee is claimed.

Provider errors, timeouts or malformed/hallucinated extraction become FAILED jobs and **never silently fall back to simulated extraction**. Extraction-policy/model changes invalidate current review hashes; old approvals need a new review. Existing seeded listings remain historical fixtures, not proof they were analyzed by the SDK. `DOCUMENT_EXTRACTION_BACKEND=SIMULATED` is an explicit offline-demo mode only; tests select it intentionally.

After provider access is configured, verify actual model quality on two synthetic samples:

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\Final_code\backend'
uv run --locked python -m scripts.smoke_cline_sdk --run-live
```

This opt-in smoke test makes **two real requests and may spend credits**. It checks a clean PDF and inconsistent area reading without revealing credentials. A mocked gateway SDK test does not substitute for this live-quality check.

Generate easy-to-upload sample files with `uv run --locked python -m scripts.generate_demo_documents`. They go to `D:\Cline_AI_CodeAlchemists\Final_code\.demo-documents`: clean checklist PDFs for each survey, a deliberately inconsistent land record, and a clearly fake identity PDF. These are not replicas of official forms.

Uploading a second document of the same type adds immutable evidence and invalidates the old review. The simulated reader compares the **latest upload for each required type**, while retaining prior bytes/history. This is the documented demo correction policy; no undocumented predecessor parameter is required. All historical jobs stay readable but cannot approve newer evidence.

## Checks and API export

```powershell
Set-Location 'D:\Cline_AI_CodeAlchemists\Final_code\backend'
uv run --locked pytest -q
uv run --locked ruff check app scripts tests
uv run --locked python -m scripts.export_openapi
```

Export goes to `D:\Cline_AI_CodeAlchemists\Final_code\contracts\openapi.json`. Generate frontend types from it. Test database defaults to port55432 `_test`; conftest refuses destructive setup elsewhere. Test storage is resolved relative to the current project location.

## Limits and roadmap

Demo-only government HMAC events, local file storage, bounded in-process login throttling, seeded officer assignments, simple policy and in-app notifications. No real laws are asserted. No payments/escrow, official title guarantee, production security certification, connected government adapters, chat/video or live OTP. Uploaded PDF/image parsing and SDK execution are bounded, but not production OS security sandboxes; stronger isolation/retention/monitoring is future work. Real provider credentials and clean/inconsistent model-quality testing remain operator requirements. Canonical matching currently uses reviewed synthetic identifiers only; ambiguous/unseeded mappings block rather than guess. Forward ownership/relisting after transfer is not implemented; old listings never reopen.

Preserve the full roadmap in the original packs. Frontend sign-off, persistent immutable agreement/case/evidence relational history (current terms/case collections use JSON plus audited actions), provider reconciliation/coverage guarantees, production deployment controls and configured live-model smoke tests remain later checkpoints. No Git repository was initialized or published by this task.

SDK dependencies include a broad upstream tool/provider runtime. On integration, `npm audit --omit=dev` reported **34 advisories: 4 critical, 14 high, 11 moderate, 5 low**, including transitive git/provider packages. A non-forced `npm audit fix --ignore-scripts` did not resolve them. Tool disabling and subprocess boundaries reduce capabilities but do not eliminate dependency risk. **Do not deploy this as production-safe.** Recheck advisories/upstream fixes before deployment; do not run `npm audit fix --force` without revalidating the pinned SDK and protocol.