# Pages 10 and 11 — buyer dashboard and transaction workspace

Contribution requested by bbhargav2628. Implemented in the existing React/Vite application using existing repository imagery and the supplied visual references.

## Run

Requires Node 20.19+ or 22.12+.

```sh
cd frontend
npm ci
npm run dev
```

- `/page-10` or `/buyer/dashboard`: buyer dashboard.
- `/buyer/requests`: purchase requests with status filters.
- `/page-11` or `/buyer/transactions/TX-2048`: transaction workspace.
- `/transactions`: opens the active workspace.

## Working interactions

Dashboard status filters and request details; active transaction navigation; profile and marketplace navigation; shared evidence summaries; buyer Proceed/Continue discussion decisions; agreement unlock after both decisions; required cancellation reason; reserved parcel hold; timeline updates; session state shared between dashboard and workspace. Layout adapts to mobile, with keyboard-accessible controls and native modal focus handling.

## Integration boundary

These two pages use explicit synthetic, memory-only state, consistent with the existing frontend previews. Reload resets the session. They do not claim server persistence, real identity approval or legal transfer. `buyer-workspace-service.mjs` isolates transaction commands for a future authenticated API adapter. Server authorisation, versions and parcel locking remain mandatory for live use.

Page 12 currently uses another independent fixture (TRX-2025-1043), whereas these references show TX-2048. The agreement link explains that distinction before opening the existing preview. Cancellation is displayed and held inside TX-2048 instead of pretending page 13's unrelated case is the same record. Full frontend/backend integration remains outstanding across the repository.

Existing account, seller, marketplace, agreement, cancellation, outcome and officer pages are retained. Original screenshot files are not included. Rollup uses its official WebAssembly implementation for portable builds on Windows systems that block native modules.

## Verify

```sh
npm test
npm run build
```

Manually open page 10, filter Pending, open the accepted workspace, view evidence, choose Proceed, return to the dashboard and verify its stage, then request cancellation with a reason. The parcel must remain reserved, and agreement must be locked. Reload should restore the initial demo fixture.
