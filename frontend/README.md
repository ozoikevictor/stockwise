# StockWise

## Offline desktop app

From this frontend folder run `npm run desktop` to build the frontend/backend and open StockWise as a desktop app. After building, `npm run desktop:open` opens it again without rebuilding. The backend source lives in `../backend`.

The desktop version stores its database in the operating system's application data folder (`%APPDATA%/stockwise/stockwise.sqlite` on Windows), outside this source folder. It requires no internet connection after setup. Browser demo accounts/data remain separate: create a desktop owner account, then optionally export JSON from the browser and import it in desktop Settings. Imported demo staff need new passwords and reactivation.

Desktop Settings offers a full SQLite backup to a selected file, plus shop JSON import/export. A dated automatic database snapshot is taken on the first launch each day. Copy backups to a separate device; a local snapshot cannot survive disk failure. For now, JSON is the in-app restore route; full SQLite disaster recovery requires replacing the database while the app is closed. Owner password recovery and native installer distribution are still pending.

Verification: `npm run test:backend`, `npm test`, and `npm run test:desktop` (after `npm run build:desktop`). The desktop smoke test uses a disposable profile.

Inventory and sales management for shops, built with React, TypeScript, TanStack Start, Tailwind CSS, and Vite.

## Local development

Install Node.js, then run these commands in this folder:

```sh
npm install
npm run dev
```

Open the local address printed by Vite.

## Commands

- npm run build: create a production build.
- npm run preview: preview the build.
- npm run lint: check code quality.
- npm test: run tests.

The `npm run dev` browser preview uses browser local storage. The Electron desktop app uses the local SQLite backend. Native installers are not yet configured.
