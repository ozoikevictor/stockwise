# StockWise upgrade: inspection and implementation plan
Date: 10 November 2026

## Phase 1 findings and checkpoint
Existing React/TanStack UI, Electron IPC, local SQLite backend and installers will be retained.
SQLite currently has a records table with JSON values, not normalized product/sale tables. Schema version 1.
Browser authentication/storage is separate from desktop and is not production online authentication.
Owner, cashier and inventory roles exist. Backend commands check permissions and use transactions, scrypt passwords and input validation.
Security gap: backend publicState only removes password hashes; cost prices, sale costs/profits, other staff records and expenses are still returned to staff. UI hiding does not protect these fields.
Sales history exports also include cost/profit fields. Products page displays inventory cost. Staff needs a dedicated safe data contract, not zero-filled owner records.
No central HTTP API, PostgreSQL schema, device registration, offline allocation ledger, durable sync outbox or remote admin authentication exists.
Keep existing inventory-role records during migration; do not silently promote, delete or remap them. New staff defaults to cashier; owner reviews legacy role mappings.

Checkpoint:
upgrade-checkpoints/phase-1/shop-before-upgrade.sqlite is a copy of the existing database (plus WAL when present).
Copied database integrity_check: ok. Readable records: 6; three shop payloads have 14/1/2 products and 88/0/2 sales.
Live source cannot be queried reliably while its app holds files in this restricted session. This checkpoint is not a substitute for a closed-app verified pre-migration backup.
Before any migration, close StockWise, create a consistent backup, reopen it, compare every table/record and financial totals, and record checksums. No live data migration has run.
Baseline backend tests: 5 passed (persistence, overselling/refunds, authorization, backups, validation).

## File-by-file phases and acceptance gates

### Phase 2: admin and staff permissions (next)
backend/src/index.ts: authenticated response projections for snapshots and action results, owner-only registration/bootstrap rules, staff receipt ownership.
backend/src/public-state.ts (new): explicit owner/staff DTO allowlists; omit financial fields, expenses, audit, other users/sales and hashes. Locked-state projection exposes only sign-in/switching metadata.
frontend/src/lib/types.ts and new contracts: safe catalog/sale types, explicit financial capability; no pretending redacted data is full ShopData.
frontend/src/lib/store.ts: consume role-specific response contracts; preserve owner state separately from staff response.
frontend/src/lib/permissions.ts: own-sales and own-dashboard permissions; preserve legacy role compatibility.
frontend/src/routes/_shop.tsx: staff navigation and role-specific home.
frontend/src/routes/_shop.products.tsx, _shop.sales.tsx and components/shop/SaleDialogs.tsx: remove costs/profits and confidential exports from staff views.
frontend/src/routes/_shop.dashboard.tsx or new staff route: today's own sales, transactions, items sold, quick sale.
frontend/src/components/shop/LockScreen.tsx, routes/login.tsx, _shop.staff.tsx: role-aware local switching; clearly distinguish local switching from future remote device login.
Tests: inspect actual IPC payloads and exports; deny owner commands by direct calls; staff A cannot see staff B sales/receipts; owner data unchanged; locked-state data inaccessible.
Manual gate: owner creates two cashier accounts, switches users, records a sale, checks restricted screens and returns to owner to verify stock and totals.
Limitation: owner and staff currently share the same physical SQLite database. Strong at-rest staff separation requires the per-device cache in phase 6. Do not call phase 2 full device isolation.

### Phase 3: central backend
backend/server/package.json, src/app.ts, config.ts, auth/*, middleware/*, routes/* (new): Express/TypeScript HTTP server, validated requests, sessions, shop isolation, rate limits, health checks.
backend/server/prisma/schema.prisma and migrations (new): shops, users, memberships, products/variants, devices, allocations, stock movements, sales/items, payments/refunds, expenses, audit, change log.
backend/server/src/services/sales.ts: integer minor-unit money, idempotency, transactional stock accounting; server computes costs and profits.
Keep backend/src/index.ts as embedded local adapter.
Tests: two shops cannot cross-access; authentication, invalid requests, idempotency and concurrent last-item sale.
Gate: test against a disposable PostgreSQL database; never use real shop data for development fixtures.

### Phase 4: multiple online computers
frontend/src/lib/api-client.ts, desktop/device-identity.cjs (new): configurable API URL, registered device and OS-protected token storage.
backend/server/src/realtime/*: authorized shop/device notifications; authoritative changes fetched over API after reconnect.
Test two separate local profiles, simultaneous sales, reconnect and duplicate retry.

### Phase 5: admin web dashboard
frontend/src/lib/store.ts and browser auth routes: central server-backed browser adapter replacing localStorage demo auth for connected mode.
Reuse existing responsive owner pages; no Electron API dependency in browser.
Test admin phone layout, session expiry, secure cookie/CSRF strategy and remote confirmed totals.
Deployment requires a selected hosting provider, PostgreSQL and HTTPS endpoint; no deployment has been performed.

### Phase 6: offline sync
backend/src/local-schema.ts, outbox.ts, sync.ts (new): versioned local tables, atomic sale/outbox commit, idempotency keys, change cursor and retry backoff.
backend/server/src/services/allocations.ts: reserve per-device quantities; allocations cannot be reassigned on disconnect or timeout alone.
Staff local cache contains selling catalog and own sales only, never product cost/profit. Owner caches remain separate.
Finite device-bound offline authorization; first login online; revoked disconnected device retains authorization only until expiry.
Online and offline stock use one documented allocation ledger; accepted offline sales consume reservations once.
Price changes: preserve actual charged price and allocation/catalog revision; flag exceptional policy violations for reconciliation.
Admin cannot know current pending-sale counts on disconnected devices; display last-reported status/time, not fabricated real-time totals.
Tests: two devices offline, allocation exhaustion, crash/restart, server commit with lost response, reordering/duplicate delivery, refunds, expired authorization, lost device recovery.

### Phase 7: migration and reconciliation
backend/migrations/import-existing.ts and verify-existing.ts (new): dry-run manifest, stable IDs, repeat-safe upload and shop mapping.
Convert existing major-unit amounts to integer minor units with reconciliation, never blind multiplication of already converted records.
Reconcile quantity, revenue, gross profit, refunds and record IDs before enabling multiple tills.
Existing local credentials need explicit account claiming/reauthorization; do not upload browser demo hashes as production passwords.
Rollback keeps original SQLite and owner access. Avoid financial writes to old and new ledgers simultaneously.

### Phase 8: installers and release
frontend/desktop/main.cjs, preload.cjs: async bounded sync IPC, resource-safe startup and restricted origins; preserve synchronous legacy paths until migrated carefully.
frontend/electron-builder.json, package.json: versioned Windows installer, preserved userData, optional API endpoint configuration.
Mac installers require macOS build/signing and actual Mac testing; there is no verified Mac installer today.
Tests: upgrade old profile, restart offline, receipts, backups, rollback; Windows and macOS separately.

## Order and review
Finish and test each phase before starting the next.
No upload of existing records, destructive migration, deployment or credential creation is included in this inspection.
Next gate: implement phase 2 on fixtures and a new development build, then user tests owner/cashier behavior before central backend work.

## Phase 2 implementation checkpoint
Implemented local Electron IPC response filtering for snapshots and action results. Staff gets own sales, selling catalog and user-switch metadata; financial keys/password hashes are omitted. Locked snapshots contain no products/sales.
Owner calculations and database records remain full-fidelity. Staff payloads are not written back as owner records.
Products uses a separate StaffCatalog; financial product-detail route is owner-only. Sales exports and receipt details exclude staff cost/profit columns. Added My dashboard in the shop timezone.
Legacy inventory role is retained as read-only catalog access; owner can choose Cashier to permit sales. No existing role records were rewritten.
Six backend tests pass, including two cashiers, direct forbidden commands, receipt ownership, locked snapshots and owner stock/cost verification.
Limitations: this phase secures the desktop renderer/IPC boundary, not a hostile user with direct access to the shared SQLite file. Separate staff device caches and remote login belong to later phases. Browser localStorage is still a development adapter, not the deployed secure web dashboard.
Manual test:
1. Open StockWise Staff Test (separate build; same existing local data).
2. Owner: create two cashier accounts in Staff.
3. Lock icon: select cashier A, enter that cashier password.
4. Check My dashboard, Products, Record Sale, Sales History. No cost/profit, product changes, expenses, staff or settings.
5. Record a sale; print/view receipt; export own sales. No financial cost/profit columns.
6. Lock, switch to cashier B: cashier A's sale must be absent.
7. Lock, choose owner: both cashiers' sales and accurate stock/profit must be visible.
Do not enter real sales merely for testing; use an explicitly identified test product and retain an audit trail. Live production fixtures were not inserted automatically.

## Phase 3A — online backend foundation
Added backend/server with Express 5, TypeScript, pg, Zod and a PostgreSQL migration.
Endpoints: database health, shop/owner registration, login/logout/current user, create/disable cashier, list/create products, own/shop sales and idempotent sale recording.
Uses scrypt passwords, hashed expiring bearer tokens, explicit origin allowlist, validation, shop-scoped queries, owner-only product/staff mutations and financial DTO filtering.
Sales reserve an idempotency key before stock locks and preserve server prices/costs in integer minor units.
No desktop integration, deployment, PostgreSQL provisioning or existing-data migration performed.
PostgreSQL isn't installed/detected locally. Three pg-mem-backed API suites exercise Express endpoints; they cannot prove PostgreSQL transaction semantics.
A separate real-PostgreSQL test uses TEST_DATABASE_URL with an isolated temporary schema, testing concurrent last-unit sales, concurrent duplicate requests and rollback. Do not use a production database for this test.
Next gate: provision/connect a disposable PostgreSQL development database, run migrations and real PostgreSQL tests, then extend catalog variants/edit/restock and connect the test app.

## Phase 4A — first connected UI
Added frontend/src/routes/online.tsx and lib/online-api.ts. Local login offers "Sign in to online shop".
Online sessions live only in memory, separate from desktop auth/SQLite. Owner registers online shop, creates cashier with separate email, adds sellable products with integer-minor-unit prices. Cashier sees safe catalog and own sales; owner sees shop sales/profits. Refresh polls every 10 seconds; this is not WebSocket delivery.
Vite and Electron forward /online-api to fixed http://127.0.0.1:3003/api. No database password or endpoint chooser is exposed to renderer.
Online requests time out after 15 seconds. Ambiguous sale failures retain the same request/idempotency key for in-session retry. Pending sales are not durable across app exit yet; do not use this milestone for live selling.
Deliberate current limitations: one stock item per product, one line per sale in the initial UI, no online receipt printing/refunds, no full original-page adaptation, no remote hosting or device/offline authorization/outbox. These features remain required before the final upgrade.
This is local integration with the development API, not proof of multi-machine deployment.
Manual gate: keep backend running; open updated Staff Test, log out of local shop, select online sign-in, create separate online owner, add test product, create online cashier, sign out and sign in as cashier, record a test sale, sign back in as owner and verify stock/sales. Local records stay unchanged.

## Phase 4B first test gate: online restock and receipts
Added owner-only idempotent restock endpoint, audit trail and quantity cap. Added server-authorized receipt endpoint excluding financial cost data for both owner and cashier.
Online product cards offer Restock to owners. Sale cards offer receipt viewing and printing via the existing application browser engine; print CSS hides dashboard controls/costs.
Four online API suites passed, including restock retries, cashier restrictions and receipt ownership; frontend/backend TypeScript passed.
Product variations and full reuse of the original owner dashboard remain pending after this manual test gate.

## Online design alignment
OnlineShell now uses the existing navy sidebar/green brand tokens, mobile navigation drawer, profile header, Record Sale action and theme toggle.
Online sign-in reuses AuthLayout. Dashboard uses existing PageHeader, StatCard, Panel and EmptyState components with actual loaded data. Cashier omits owner profit/inventory-cost cards.
Product cards use existing ProductThumb and card shadows; online forms and sale cards use main app spacing/radii/colors.
Metrics explicitly describe the latest 200 transactions or loaded catalog; no invented totals/charts.
Local and online records remain separate; this change updates presentation, not database storage.
