import { OnlineError, type OnlineUser, type OnlineProduct, type OnlineSale } from "./online-api";

export type OnlineSession = { token: string; user: OnlineUser; expiresAt: string };
export type QueuedSale = {
  id: string;
  savedAt: string;
  state: "waiting" | "review" | "confirmed" | "cancelled";
  error?: string | undefined;
  payment: string;
  lines: { productId: string; quantity: number; expectedPriceMinor: number }[];
  productName: string;
  totalMinor: number;
  serverId?: string;
};
type AccountCache = {
  products: OnlineProduct[];
  sales: OnlineSale[];
  queue: QueuedSale[];
  updatedAt: string;
};
export type SyncDisk = {
  version: 1;
  session: OnlineSession | null;
  accounts: Record<string, AccountCache>;
};
export type SyncState = {
  ready: boolean;
  session: OnlineSession | null;
  cache: AccountCache;
  syncing: boolean;
  connected: boolean;
  message: string;
};
const empty = (): AccountCache => ({ products: [], sales: [], queue: [], updatedAt: "" });
export function createOnlineSync(deps: {
  load: () => Promise<SyncDisk | null>;
  save: (data: SyncDisk) => Promise<void>;
  api: <T>(path: string, token: string | null, method?: string, body?: unknown) => Promise<T>;
  now?: () => number;
  uuid?: () => string;
  online?: () => boolean;
}) {
  let disk: SyncDisk = { version: 1, session: null, accounts: {} };
  let state: SyncState = {
    ready: false,
    session: null,
    cache: empty(),
    syncing: false,
    connected: false,
    message: "",
  };
  const listeners = new Set<() => void>();
  const now = () => deps.now?.() ?? Date.now();
  const key = (s: OnlineSession) => s.user.shopId + ":" + s.user.id + ":" + s.user.role;
  const emit = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  let authBlocked = false;
  const valid = () =>
    !authBlocked && !!state.session && Date.parse(state.session.expiresAt) > now();
  let loadFailed = false;
  let writing = Promise.resolve();
  // Capture each whole snapshot; failed writes must never acknowledge a sale as saved.
  function persist(next: SyncDisk) {
    if (loadFailed)
      throw Error("Offline records could not be read. Restart before saving any sale.");
    const copy = structuredClone(next);
    const work = writing.catch(() => {}).then(() => deps.save(copy));
    writing = work;
    return work;
  }
  let mutations = 0;
  let mutating = Promise.resolve();
  function commit(update: (cache: AccountCache) => AccountCache) {
    mutations++;
    const work = mutating
      .catch(() => {})
      .then(async () => {
        const cache = update(state.cache);
        const s = state.session;
        if (!s) throw Error("Sign in to this cashier account first.");
        const next = { ...disk, accounts: { ...disk.accounts, [key(s)]: cache } };
        await persist(next);
        disk = next;
        emit({ cache });
      })
      .finally(() => {
        mutations--;
      });
    mutating = work;
    return work;
  }
  let working = false;
  const pending = () =>
    state.cache.queue.filter((q) => q.state === "waiting" || q.state === "review");
  const available = () =>
    state.cache.products.map((p) => ({
      ...p,
      quantity: Math.max(
        0,
        p.quantity -
          pending().reduce(
            (n, q) =>
              n + q.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0),
            0,
          ),
      ),
    }));
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getState: () => state,
    available,
    pending,
    async restore() {
      if (state.ready) return;
      try {
        const saved = await deps.load();
        if (saved) {
          if (saved.version !== 1) throw Error("Unsupported offline data version.");
          disk = saved;
        }
        const s = disk.session && Date.parse(disk.session.expiresAt) > now() ? disk.session : null;
        emit({ ready: true, session: s, cache: s ? (disk.accounts[key(s)] ?? empty()) : empty() });
      } catch (e) {
        loadFailed = true;
        emit({ ready: true, message: "Could not read offline records: " + (e as Error).message });
      }
    },
    async signIn(session: OnlineSession) {
      if (working || mutations) throw Error("Wait for synchronization to finish.");
      if (pending().length && state.session?.user.id !== session.user.id)
        throw Error("Sync pending sales before switching accounts.");
      const next = { ...disk, session };
      await persist(next);
      disk = next;
      authBlocked = false;
      emit({
        session,
        cache: disk.accounts[key(session)] ?? empty(),
        message: "",
        connected: true,
      });
    },
    async signOut() {
      if (working || mutations || pending().length)
        throw Error("Sync or resolve pending sales before signing out.");
      const next = { ...disk, session: null };
      await persist(next);
      disk = next;
      emit({ session: null, cache: empty(), connected: false });
    },
    async enqueue(productId: string, quantity: number, payment: string) {
      if (!valid())
        throw Error(
          "Session expired. Reconnect and sign in to the same account. Pending sales are kept.",
        );
      const p = available().find((p) => p.id === productId);
      if (
        !p ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10000 ||
        quantity > p.quantity
      )
        throw Error("Not enough cached stock or invalid quantity.");
      if (!["Cash", "Transfer", "POS", "Other"].includes(payment))
        throw Error("Invalid payment method.");
      const q: QueuedSale = {
        id: deps.uuid?.() ?? crypto.randomUUID(),
        savedAt: new Date(now()).toISOString(),
        state: "waiting",
        payment,
        lines: [{ productId, quantity, expectedPriceMinor: p.priceMinor }],
        productName: p.name,
        totalMinor: p.priceMinor * quantity,
      };
      await commit((cache) => {
        const reserved = cache.queue
          .filter((q) => q.state === "waiting" || q.state === "review")
          .reduce(
            (n, q) =>
              n +
              q.lines.filter((l) => l.productId === productId).reduce((a, l) => a + l.quantity, 0),
            0,
          );
        if (quantity > (cache.products.find((p) => p.id === productId)?.quantity ?? 0) - reserved)
          throw Error("Not enough cached stock.");
        return { ...cache, queue: [...cache.queue, q] };
      });
      return q;
    },
    async review(id: string, action: "retry" | "cancel") {
      if (working) throw Error("Wait for synchronization to finish.");
      const q = state.cache.queue.find((q) => q.id === id);
      if (!q || q.state !== "review")
        throw Error("Only a rejected sale can be retried or cancelled.");
      working = true;
      try {
        await commit((cache) => ({
          ...cache,
          queue: cache.queue.map((q) =>
            q.id === id
              ? {
                  ...q,
                  state: action === "retry" ? "waiting" : "cancelled",
                  error: action === "retry" ? undefined : q.error,
                }
              : q,
          ),
        }));
      } finally {
        working = false;
      }
    },
    async sync() {
      if (working || mutations || !state.session) return;
      if (deps.online?.() === false) {
        emit({ connected: false, message: "Offline. Sales will be saved on this device." });
        return;
      }
      if (!valid()) {
        emit({
          connected: false,
          message:
            "Session expired. Reconnect and sign in to the same account to sync saved sales.",
        });
        return;
      }
      working = true;
      emit({ syncing: true });
      const session = state.session;
      try {
        // Validate identity and feature support before sending any saved sale.
        const health = await deps.api<{ offlineSalesVersion?: number }>("/health", null);
        if (health.offlineSalesVersion !== 1)
          throw Error("Server update required before offline sales can sync.");
        const who = await deps.api<OnlineUser>("/me", session.token);
        if (
          who.id !== session.user.id ||
          who.shopId !== session.user.shopId ||
          who.role !== session.user.role
        )
          throw new OnlineError("Account changed. Sign in again.", 401);
        emit({ connected: true, message: "" });
        for (const q of [...state.cache.queue]) {
          if (q.state !== "waiting") continue;
          try {
            const sale = await deps.api<OnlineSale>("/sales", session.token, "POST", {
              idempotencyKey: q.id,
              payment: q.payment,
              lines: q.lines,
              recordedAt: q.savedAt,
            });
            await commit((cache) => {
              const products = cache.products.map((p) => ({
                ...p,
                quantity: Math.max(
                  0,
                  p.quantity -
                    q.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.quantity, 0),
                ),
              }));
              return {
                ...cache,
                products,
                sales: [sale, ...cache.sales.filter((s) => s.id !== sale.id)],
                queue: cache.queue.map((v) =>
                  v.id === q.id
                    ? { ...v, state: "confirmed", serverId: sale.id, error: undefined }
                    : v,
                ),
              };
            });
          } catch (e) {
            if (e instanceof OnlineError && [400, 403, 404, 409].includes(e.status)) {
              await commit((cache) => ({
                ...cache,
                queue: cache.queue.map((v) =>
                  v.id === q.id ? { ...v, state: "review", error: e.message } : v,
                ),
              }));
              continue;
            }
            throw e; // Timeouts and unknown outcomes retain the exact request key.
          }
        }
        const [products, sales] = await Promise.all([
          deps.api<OnlineProduct[]>("/products", session.token),
          deps.api<OnlineSale[]>("/sales", session.token),
        ]);
        await commit((cache) => ({
          ...cache,
          products,
          sales,
          updatedAt: new Date(now()).toISOString(),
        }));
        emit({
          connected: true,
          message: pending().some((q) => q.state === "review")
            ? "Some saved sales need review."
            : pending().length
              ? "Sales saved on this device are waiting for synchronization."
              : "All waiting sales synchronized.",
        });
      } catch (e) {
        if (e instanceof OnlineError && e.status === 401) authBlocked = true;
        emit({
          connected: false,
          message:
            e instanceof OnlineError && e.status === 401
              ? "Sign in again to the same account. Saved sales are kept."
              : (e as Error).message,
        });
      } finally {
        working = false;
        emit({ syncing: false });
      }
    },
  };
}
