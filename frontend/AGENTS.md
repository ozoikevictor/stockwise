## Project rules
- All app state lives in `src/lib/store.ts` (useSyncExternalStore + LocalStorage per user); pure stock/sale rules live in `src/lib/inventory.ts` so a backend can replace storage without touching UI.
- Shop pages live under the pathless `_shop` layout, which guards on the demo session client-side; it is not a security boundary.
- Role permissions live in `src/lib/permissions.ts`; every store action calls `needPerm` and pages wrap in `RequirePerm`, so hiding buttons is never the only check.

