import { useSyncExternalStore } from "react";
import { createStoreCore, type State, type StoreActions } from "./store-core";
import { demoHash } from "./format";
import { emptyShopData } from "./seed";
import { can, type Perm } from "./permissions";
export type { Actor } from "./store-core";

type DesktopReply = { ok: boolean; state?: State; result?: unknown; error?: string };
declare global {
  interface Window {
    stockwiseDesktop?: { onlineConfig(value?: string): Promise<string>; request(command: string, args: unknown[]): DesktopReply; printReceipt(saleId: string): Promise<{ ok: boolean; error?: string }> };
  }
}
const SERVER_STATE: State = { ready: false, auth: { users: [], sessionUserId: null }, data: emptyShopData(), actor: null, locked: false };
function applyTheme(theme: "light" | "dark") {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", theme === "dark");
}
const browserCore = createStoreCore({
  storage: {
    read<T>(key: string): T | null { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : null; },
    write(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    remove(key) { localStorage.removeItem(key); },
  },
  hashPassword: demoHash,
  verifyPassword: (password, encoded) => demoHash(password) === encoded,
  applyTheme,
});
let desktopState: State | null = null;
const desktopListeners = new Set<() => void>();
const desktop = () => typeof window !== "undefined" ? window.stockwiseDesktop : undefined;
function request(command: string, args: unknown[] = []): unknown {
  const reply = desktop()!.request(command, args);
  if (!reply.ok || !reply.state) throw new Error(reply.error ?? "Could not save changes to the local database.");
  desktopState = reply.state;
  applyTheme(desktopState.data.prefs.theme);
  desktopListeners.forEach((listener) => listener());
  return reply.result;
}
function snapshot(): State {
  if (!desktop()) return browserCore.getState();
  if (!desktopState) request("snapshot");
  return desktopState!;
}
export function useStore<T>(select: (state: State) => T): T {
  return useSyncExternalStore(
    (listener) => {
      if (desktop()) { desktopListeners.add(listener); return () => { desktopListeners.delete(listener); }; }
      return browserCore.subscribe(listener);
    },
    () => select(snapshot()),
    () => select(SERVER_STATE),
  );
}
export const useData = () => useStore((s) => s.data);
export const useCurrentUser = () => useStore((s) => s.auth.users.find((u) => u.id === s.auth.sessionUserId) ?? null);
export const useReady = () => useStore((s) => s.ready);
export const useActor = () => useStore((s) => s.actor);
export const useLocked = () => useStore((s) => s.locked);
export const useCan = (p: Perm) => useStore((s) => !!s.actor && !s.locked && can(s.actor.role, p));
export const isDesktop = () => !!desktop();
export const backupDatabase = () => request("backupDatabase") as boolean;
export const actions: StoreActions = new Proxy(browserCore.actions, {
  get(target, property) {
    if (typeof property !== "string" || !Object.hasOwn(target, property)) return undefined;
    if (!desktop()) return Reflect.get(target, property);
    return (...args: unknown[]) => request(property, args);
  },
});
