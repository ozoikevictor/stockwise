# StockWise backend

Local backend for one computer per shop. It owns SQLite access, password hashing, input validation, command authorization, and atomic database transactions.

## Files

- `src/index.ts`: backend entry and database operations.
- `build.mjs`: bundles the backend using the existing frontend development dependencies.
- `dist/backend.cjs`: generated backend bundle.

From this folder, run `npm run build`. Install the frontend dependencies first if they are missing.

This is an embedded backend loaded by Electron, so it does not require a separate web server or an internet connection. The Electron window and restricted preload bridge remain in `../frontend/desktop`.

The shared application rules currently live in `../frontend/src/lib/store-core.ts`, `inventory.ts`, and `permissions.ts`. Both browser testing and the desktop backend reuse those rules.

From `../frontend`, run `npm run desktop` to build both sides and open the desktop app. `npm test` here builds and runs SQLite persistence, transaction, backup, authentication, and permission tests. Browser data remains separate from the desktop database. Native installers are still pending.

Current checks: all five backend tests pass under both regular Node and Electron's embedded Node runtime; the desktop frontend builds. The native window smoke test currently exits before producing a result in the automated Windows session, so interactive desktop verification is still pending.
