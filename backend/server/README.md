# StockWise online backend — phase 3 foundation

This is an additive Express/TypeScript/PostgreSQL service. It does not open or migrate the existing desktop SQLite database. The desktop app is not connected to this service yet.

## Run locally

1. Install Node 22 or newer and PostgreSQL. Create an empty development database and a database user allowed to create tables in that database.
2. In this folder run `npm install`.
3. Set `DATABASE_URL` to that development database, using `.env.example` as a reference. Scripts read environment variables; they do not automatically load `.env` files.
4. Run `npm run migrate`, then `npm run dev`.
5. Test `http://127.0.0.1:3003/api/health`.

The service binds to the local computer by default. Change HOST only when deliberately configuring deployment. Production requires HTTPS, proper host/proxy configuration and an externally backed rate limiter before scaling across server processes. Never put DATABASE_URL in the frontend or installer.

## Implemented API

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/health | Public; checks database connectivity |
| POST | /api/auth/register | New owner and isolated shop |
| POST | /api/auth/login | Eight-hour bearer session |
| POST | /api/auth/logout | Current session |
| GET | /api/me | Current identity |
| POST | /api/staff | Owner creates cashier |
| PATCH | /api/staff/:id | Owner enables/disables own cashier |
| GET | /api/products | Own shop; costs omitted for cashiers |
| POST | /api/products | Owner only |
| GET | /api/sales | Owner sees shop sales; cashier sees own sales |
| POST | /api/sales | Authenticated sale with idempotencyKey |

Amounts use integer minor units: NGN 1,500 = 150000. For this first API milestone, a product represents one sellable stock item. Existing variations/categories, editing/restocking, receipts/refunds, pagination, devices, WebSocket notifications and synchronization remain subsequent work. Existing desktop feature implementations remain in place.

Sale prices and costs are taken from server records. Clients cannot submit costs, profits, staff roles or shop IDs. PostgreSQL transactions lock product rows in deterministic order, prevent negative stock and commit sale/items/audit together. Idempotency keys reject conflicting payloads and permit safe retries. Staff DTOs omit cost/profit fields.

## Verification and limits

`npm run typecheck` checks TypeScript. `npm test` exercises real Express routes with isolated in-memory PostgreSQL emulation (pg-mem). It does not establish PostgreSQL locking, transaction rollback or concurrent-sale correctness. A real PostgreSQL concurrency/rollback test is required before multi-computer use.

No deployment, existing-data upload, account claiming or production migration has happened. Use temporary accounts only. This is the first backend milestone, not the completed online/offline upgrade.

### Real PostgreSQL verification
Set TEST_DATABASE_URL to a disposable PostgreSQL development database, then run npm test.
The PostgreSQL test creates and drops one uniquely named test schema; it does not touch the desktop SQLite database.
Without TEST_DATABASE_URL, that test is explicitly skipped.

## Online restocking and receipts
POST /api/products/:id/restock accepts { quantity, idempotencyKey }, owner only. The operation key is reserved in audit_log inside the same transaction as the stock update; repeated identical requests do not add stock twice. Reusing a key for a different product, quantity or actor is rejected.
GET /api/sales/:id/receipt returns shop name/timezone, cashier name and sale items/totals without cost/profit fields. A cashier can retrieve only their own receipts; the owner can retrieve their shop's receipts.
No database schema change is required for these endpoints. The initial connected UI now provides Restock and View receipt/Print receipt. Native printer output still requires manual testing.
