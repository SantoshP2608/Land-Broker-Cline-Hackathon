# Private Cline SDK extraction worker

This is a **Node 24**, ESM-only private subprocess helper, pinned to the official
`@cline/sdk@0.0.92`. It is not a standalone model HTTP client. Production execution
imports `ClineCore` from `@cline/sdk`, calls `ClineCore.create(...)` and `.start(...)`,
and validates `result.result.text`. No TypeScript compiler or test framework is needed.

## Install and validate

```powershell
npm ci --prefix 'D:\Cline_AI_CodeAlchemists\Final_code\backend\ai_worker' --ignore-scripts
npm test --prefix 'D:\Cline_AI_CodeAlchemists\Final_code\backend\ai_worker'
node 'D:\Cline_AI_CodeAlchemists\Final_code\backend\ai_worker\src\runner.mjs' --check
```

`--check` imports the installed real SDK, checks its package version and Node major
version, and verifies required configuration. It never creates a session or calls a
model. With an installed compatible SDK it exits zero even when `ready` is false:

```json
{"sdk_version":"0.0.92","ready":false,"missing":["CLINE_PROVIDER_ID","CLINE_MODEL_ID","CLINE_API_KEY"],"node_version":"24.12.0"}
```

`missing` contains environment-variable names only. SDK import/version/Node failures
produce the safe error envelope below with a nonzero exit code.

## Explicit model configuration

| Environment variable | Requirement |
| --- | --- |
| `CLINE_PROVIDER_ID` | Exactly `anthropic`, `openai`, `openrouter`, or `ollama` |
| `CLINE_MODEL_ID` | Explicit chosen model identifier; no guessed/default model |
| `CLINE_API_KEY` | Required except for `ollama`; supplied by the Python bridge |
| `CLINE_BASE_URL` | Optional HTTP(S) provider API base URL; no URL credentials/query/fragment |
| `CLINE_TIMEOUT_SECONDS` | Integer 1–120, default 60; Python may enforce a stricter minimum |

Provider/model selection is deployment configuration, not model-generated output.
Select a model actually served by your provider with sufficient context capacity;
the 200,000-character protocol ceiling does not guarantee that any chosen model can
accept that input. Provider context errors fail safely; input is never silently truncated.

The official SDK declares `openai` as an alias for `openai-compatible`. This helper
explicitly invokes `normalizeProviderId` before `.start()`: actual SDK testing showed
that the gateway otherwise rejects the literal alias as an unknown provider. Response
`provider_id` remains the configured `openai` value, matching Python provenance checks.
`openai-native`, `cline`, IDE-account OAuth, arbitrary/custom providers and external CLI
providers are intentionally not accepted. Standard provider-specific API-key environment
variables and personal Cline login/settings are not credential fallbacks.

## Exact bridge protocol

Invoke the absolute runner path with **one UTF-8 JSON document on stdin**, then close
stdin. The caller must pass only uploaded/extracted page text, never official source
comparison values, verification records, capabilities, credentials, or paths in stdin.

```json
{
  "protocol_version": 1,
  "document": {
    "id": "4d85e62a-82dc-4d84-9cb6-001db8f8a112",
    "version": 1,
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "document_type": "LAND_RECORD"
  },
  "pages": [
    {"page_number": 1, "text": "Survey Number: 007/A\nArea (sqm): 123.455\nOwner subject reference: SUBJECT-7"}
  ]
}
```

Input keys are exact. Document ID must have UUID syntax, version is a safe integer
at least 1, and SHA-256 is 64 hexadecimal characters. Supported `document_type` enum
values match the existing backend: `IDENTITY`, `PREVIOUS_DEED`, `LAND_RECORD`,
`ENCUMBRANCE_CERTIFICATE`, `SUPPORTING_EVIDENCE`, `LAND_PHOTO`, `DRAFT_DEED`,
`REGISTERED_DEED`. Pages must number consecutively from 1: 1–100 pages, at most
200,000 Unicode code points total (matching Python `len(str)`), and a bounded
1,300,000-byte stdin envelope. Metadata is validated locally but is **not sent to
the model**; the user prompt contains only `{pages:[...]}`.

Success exits zero and emits exactly one newline-terminated JSON value on stdout:

```json
{
  "protocol_version": 1,
  "sdk_version": "0.0.92",
  "provider_id": "openai",
  "model_id": "chosen-model",
  "extraction": {
    "fields": [
      {
        "field_name": "survey_number",
        "raw_text": "007/A",
        "normalized_value": "007/A",
        "page_number": 1,
        "confidence": "0.95",
        "uncertainty_notes": []
      }
    ],
    "warnings": []
  }
}
```

Only `survey_number`, `area_sqm`, and `owner_subject_ref` are allowed. Missing fields
are omitted; `fields:[]` is valid. Every `raw_text` is a nonblank exact substring of
its referenced source page. Identifiers preserve `raw_text.trim()` exactly; owner
references must be explicit evidence, not invented from names. Positive area amounts
must already be explicitly in square metres, quoted as plain decimal numeric text;
normalization uses integer arithmetic to two places with ROUND_HALF_UP and the
backend's Numeric(18,2) bounds. Unsupported unit/separator formats are omitted with
warnings, not converted or guessed. Confidence is a decimal **string** in 0–1, at
most 10 characters. Fields/normalized strings are at most 2,000 characters; there
are at most 30 fields, 20 warnings, 10 notes per field and 500 characters per note
or warning. Total serialized stdout is at most 100,000 bytes.

The system prompt marks page text as untrusted and asks for all matching occurrences
across every page, including contradictions. Contradictions remain separate evidence;
the helper never resolves them into an authenticity/status/action decision. Duplicate
evidence for the same field/page/quote is rejected. JSON must have exact keys;
extra keys such as `status`, `action`, `approved`, or instructions are rejected at
every extraction level. A single whole-response plain or `json` Markdown fence is
accepted; surrounding prose, multiple fences, or JSON repair are not.

Errors exit nonzero and emit only:

```json
{"error":{"code":"SDK_NOT_CONFIGURED"}}
```

Allowed codes: `SDK_NOT_CONFIGURED`, `SDK_TIMEOUT`, `SDK_INVALID_OUTPUT`,
`SDK_RUN_FAILED`. Invalid stdin uses `SDK_INVALID_OUTPUT`. There are no raw provider
exceptions, stderr diagnostics, secrets, prompts or base URLs in error output.

## Isolation and lifecycle

The Python parent creates a per-call temporary directory and passes absolute
`CLINE_WORKSPACE`, `HOME`, `USERPROFILE`, `CLINE_DIR`, and `CLINE_DATA_DIR` under that
root, with Cline data nested in Cline dir. Workspace and Cline dir may be siblings.
The root must be beneath the operating-system temporary directory. The runner
respects that valid scoped layout. For standalone invocations or unsafe/incomplete
paths it creates its own isolated temporary layout instead of opening personal state.

Isolation is set **before dynamic SDK import**, because shared SDK storage captures
HOME at import time. The runner allowlists inherited environment variables, strips
unrelated provider/account/IDE/plugin/editor configuration, and scopes session, team,
database and connector paths to that temporary data directory. `APPDATA` and
`LOCALAPPDATA` are also scoped; telemetry is disabled. The caller must supply a
fresh private directory, wait for the process to exit and delete the entire directory.
This is a process-isolation boundary, not an OS filesystem/network sandbox.

Published declarations verified in the unpacked `@cline/core`/`@cline/shared` packages:

- Local backend only; automation false; no hub/account selection.
- Tools, spawn and teams false; interactive false; checkpoints false.
- `maxIterations:1`, `maxTokensPerTurn:4096`, no plugins/extensions/extra tools/skills.
- `localRuntime.configExtensions:[]` disables rules/plugins/hooks discovery.
- Model catalog refresh, private catalog and Cline Cloud model loading disabled.
- Deny policies for `*` and every ID/headless tool name from the actual SDK builtin
  catalog, using its declared `{enabled:false,autoApprove:false}` shape.
- Only SDK runs with `finishReason:'completed'` and zero tool calls are accepted.
- AbortController bounds fetches; a deadline also calls SDK `.abort(sessionId)`.
- SDK `.dispose()` is always attempted in `finally`; an explicitly owned published
  `SqliteSessionStore`/`CoreSessionService` closes SQLite after disposal, including
  Windows where default SDK disposal alone left the database handle open in testing.
- The runner fences stdout/stderr before import and has a hard process-exit fallback.
  The parent must retain its own process-tree timeout/cleanup protection.

`src/extractor.mjs` exports `runExtraction(input,{coreFactory,settings})`, strict
validators, and a declared fetch injection for tests. It is an internal library:
call it only after setting ephemeral storage before import. CLI/production callers
must use `src/runner.mjs`, not import the extractor into a personal-auth process.

## Tests and limitations

`node:test` covers strict protocol/limits, quotes and pages, exact normalization,
contradictions, forbidden decisions/actions, output fencing, safe errors, timeout,
disposal, and missing configuration. Integration tests use **real SDK create/start
orchestration against a local mocked OpenAI-compatible HTTP/SSE gateway**, including
the actual runner subprocess and Python-style temporary directories. The mocked
endpoint supplies model output; these tests are **not live-model quality testing**.
They require no external credentials, model requests, or credits. Direct SDK tests
inject fetch that rejects non-local requests and assert exactly one model request
without tools and without document metadata/official comparison input.

The SDK is published as experimental. On validation, `npm audit` reports **34
upstream/transitive advisories: 4 critical, 14 high, 11 moderate, 5 low**. A non-force
`npm audit fix --ignore-scripts` did not resolve them while retaining the exact SDK.
Critical findings include `@simple-git/argv-parser` via `simple-git` (unsafe editor
environment handling; the helper strips `VISUAL`/editor environment, disables tools
and checkpoints, and uses a temporary workspace). Other findings concern unused
provider/telemetry dependencies, but disabled paths are **not** an audit-clean or
production-security guarantee. No forced upgrades or unverified overrides are applied.
Deployment requires review of those advisories and SDK updates when fixes are available.

Quotation and schema validation constrain output; they cannot prove model completeness,
correct interpretation, or that a quoted value is semantically the claimed field.
Python must independently revalidate output and perform deterministic official-source
comparison/capability decisions outside the SDK. No live credentials were configured
or live model calls made during validation. The helper has no simulated production
fallback; deterministic simulation belongs only to the explicitly selected test backend.