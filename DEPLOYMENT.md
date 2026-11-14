# StockWise hosted setup

The cloud service serves the online dashboard and Express API from the same HTTPS address. PostgreSQL stores shared shop records. Desktop SQLite data is unchanged. Offline sales synchronization is still a separate phase.

## Deploy

1. Push this project root to a private Git repository. Exclude .env files, local-postgres, node_modules, SQLite files, build-cache and upgrade-checkpoints. The root .gitignore and .dockerignore exclude these.
2. In Render, connect that repository through New > Blueprint and select render.yaml.
3. Review the displayed costs before creating resources. The blueprint selects a paid single-instance web service and PostgreSQL database. No hosting has been purchased or created by these files.
4. Deploy. The Docker build creates the browser app; startup runs the idempotent schema migration then the backend. The database URL is injected server-side. The Render external URL is used for same-origin browser requests.
5. Open the service URL followed by /api/health and confirm ok is true. Open /online on your phone to sign in.
6. In desktop StockWise, log out, open Online server settings on the online sign-in page, paste the HTTPS service address without /api or /online, and choose Save and test connection. Repeat on each computer.

For another Docker host, set DATABASE_URL, PUBLIC_ORIGIN to the exact HTTPS origin, TRUST_PROXY=1 only behind a trusted single proxy, and a PORT if needed. Use managed PostgreSQL with backups and its provider's required TLS settings. HTTPS terminates at the host's reverse proxy.

## Accounts and existing data

A fresh hosted database starts empty. Local PostgreSQL test accounts/products do not appear there automatically. Create an online owner and cashier on the hosted service for the first test. Do not upload or overwrite an existing database without a separate migration/backup step.

## Acceptance test

- Open the same server from two cashier computers and an owner phone browser.
- Confirm owner products are shared and cashier responses omit cost/profit fields.
- Sell a product from each cashier and refresh the owner view (automatic polling is every ten seconds).
- With one unit remaining, submit one-unit sales simultaneously from two cashiers. Exactly one may succeed; stock must remain zero.
- Retry a submitted sale with its original idempotency key; it must not deduct stock twice.
- Switch cashier to owner using the password dropdown and verify wrong passwords preserve the current session.

## Validation limits

Docker needs a Linux Docker engine. This Windows session has no Docker CLI and cannot verify a deployed container. Live PostgreSQL concurrency checks require TEST_DATABASE_URL pointed at a disposable test database. The API rate limiter is per process: keep one instance until a shared limiter is added. Monitor hosting backups and test restore before live shop use. Internet loss currently blocks online operations; queued offline sales are not implemented yet.
