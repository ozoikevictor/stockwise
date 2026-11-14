# Offline sales and automatic synchronization

## Supported workflow

Sign in to the hosted shop while online and wait for the catalog to load. The desktop app saves its connected shop session and per-account catalog in Windows encrypted storage. While offline, Save sale writes the full request before acknowledging it, reserves stock on this device, and labels it waiting for confirmation. Restarting the desktop app restores pending records while the eight-hour session remains valid. After expiry, reconnect and sign in to the same account to recover and upload them. Passwords are never cached.

The engine retries when connectivity returns and every ten seconds while signed in. Each sale keeps its original UUID, payload, expected selling price, and recorded time through retries. PostgreSQL enforces one accepted sale per key and prevents negative shared stock. API responses expose original recorded time and server synchronization time separately. Product creation, restocking, staff creation and account switching require connectivity.

## Conflicts

Offline devices each know only their last downloaded catalog. They can sell the same last unit while disconnected. The server accepts only the sale that can be fulfilled; the other stays in Needs review. A changed selling price is also rejected for review. Nothing overrides server stock or silently changes the amount collected. Ask the owner to reconcile stock, goods and payment. Retry sends the unchanged request, or mark a definitively rejected sale cancelled after resolving it; cancellation is retained locally and only releases that device reservation. An uncertain network outcome cannot be cancelled because the server may already have committed it.

Pending receipts are visibly marked PENDING SERVER CONFIRMATION. Final receipts are fetched only for confirmed server records. Pending and cancelled local records appear in Sales History; pending totals are not counted as confirmed revenue/profit.

## Data and accounts

Records are isolated by server, shop, user ID and role. Pending transactions block logout and switching to a different account. The Sign in again action refreshes the same account without removing its queue. An expired or server-rejected session cannot record more sales. A previously authorized offline session can continue only until its existing expiry; remote disable takes effect on reconnect. A queue remains on the device where it was recorded. It cannot be uploaded by another device that does not have those records.

The browser version keeps queue data in browser storage and credentials only for the current tab session. Only one StockWise tab can access that cache at a time. Keep the page open when offline; loading the website from scratch without internet is not supported. Do not clear browser/app data with pending sales. Use the desktop app for reopening offline. The earlier standalone local SQLite shop and its accounts remain separate.

## Rollout and test

Deploy backend migration 002_offline_sales and the updated web application before opening the new desktop build. The sync engine checks offlineSalesVersion=1 on /api/health before sending queued requests. Render Docker startup runs the migrations automatically.

1. Sign in on the updated desktop and wait for a stock update.
2. Turn off the desktop internet, sell two units, and confirm one waiting sale and reduced available stock.
3. Close and reopen the desktop while offline. Confirm the waiting record survives.
4. Reconnect. Confirm zero waiting sales, exactly one server sale, and matching stock in the owner phone dashboard.
5. On two devices with the same final unit cached, disconnect both and record a sale on each. Reconnect both: one confirms and the other stays for review; shared stock must not go negative.
6. Resolve review records and test that a wrong account cannot upload another cashier's queue.

Unit tests cover save failures, restarts, lost responses, deduplication, reservations, conflicts, concurrent local recording, session expiry, identity mismatch and capability checks. API integration tests cover expected prices, recorded times, cashier financial privacy and replay. The real PostgreSQL test checks concurrent tills, duplicate keys, rollback and price-conflict rollback. Desktop smoke tests use a disposable profile and test encrypted storage and server isolation.
