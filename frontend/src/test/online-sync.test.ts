import { describe, it, expect } from "vitest";
import { createOnlineSync, type SyncDisk, type OnlineSession } from "../lib/online-sync-core";
import { OnlineError, type OnlineSale } from "../lib/online-api";

const instant = Date.parse("2026-11-14T12:00:00Z");
const session: OnlineSession = {
  token: "test-token",
  expiresAt: new Date(instant + 8 * 3600000).toISOString(),
  user: { id: "cashier-a", shopId: "shop-a", name: "Cashier", role: "cashier" },
};
async function fixture() {
  let saved: SyncDisk | null = null;
  let stock = 10;
  let clock = instant;
  let connected = true;
  let failWrite = false;
  let failReply = false;
  let rejectSale: OnlineError | null = null;
  let who = session.user;
  let version = 1;
  let beforeSale: (() => Promise<void>) | null = null;
  const accepted = new Map<string, OnlineSale>();
  const requests: unknown[] = [];
  let sequence = 0;
  const deps = {
    load: async () => structuredClone(saved),
    save: async (data: SyncDisk) => {
      if (failWrite) throw Error("Disk full");
      saved = structuredClone(data);
    },
    now: () => clock,
    online: () => connected,
    uuid: () => `sale-key-${++sequence}`,
    api: async <T>(
      path: string,
      _token: string | null,
      _method?: string,
      body?: unknown,
    ): Promise<T> => {
      if (!connected) throw TypeError("Network unavailable");
      if (path === "/health") return { offlineSalesVersion: version } as T;
      if (path === "/me") return who as T;
      if (path === "/products")
        return [{ id: "p", name: "Product", sku: "P", priceMinor: 500, quantity: stock }] as T;
      if (path === "/sales" && !body) return [...accepted.values()] as T;
      if (path === "/sales" && body) {
        if (beforeSale) await beforeSale();
        requests.push(structuredClone(body));
        const input = body as {
          idempotencyKey: string;
          recordedAt: string;
          lines: { quantity: number }[];
        };
        if (rejectSale) throw rejectSale;
        let sale = accepted.get(input.idempotencyKey);
        if (!sale) {
          const qty = input.lines[0]!.quantity;
          if (qty > stock) throw new OnlineError("Insufficient stock", 409);
          stock -= qty;
          sale = {
            id: input.idempotencyKey,
            cashierId: session.user.id,
            totalMinor: qty * 500,
            payment: "Cash",
            createdAt: input.recordedAt,
            items: [],
          };
          accepted.set(input.idempotencyKey, sale);
        }
        if (failReply) {
          failReply = false;
          throw TypeError("Response lost");
        }
        return sale as T;
      }
      throw Error("Unexpected API request: " + path);
    },
  };
  const store = createOnlineSync(deps);
  await store.restore();
  await store.signIn(session);
  await store.sync();
  return {
    store,
    deps,
    requests,
    accepted,
    disk: () => saved,
    stock: () => stock,
    setOffline: (v: boolean) => {
      connected = !v;
    },
    loseReply: () => {
      failReply = true;
    },
    failWrites: (v: boolean) => {
      failWrite = v;
    },
    reject: (e: OnlineError | null) => {
      rejectSale = e;
    },
    advance: () => {
      clock += 9 * 3600000;
    },
    identity: (u: typeof who) => {
      who = u;
    },
    version: (v: number) => {
      version = v;
    },
    holdSales() {
      let started!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((r) => {
        started = r;
      });
      const gate = new Promise<void>((r) => {
        release = r;
      });
      beforeSale = async () => {
        started();
        await gate;
      };
      return { entered, release };
    },
  };
}
describe("offline sale synchronization", () => {
  it("updates offline status during an upload and still accepts another saved sale", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 2, "Cash");
    const gate = f.holdSales();
    const syncing = f.store.sync();
    await gate.entered;
    f.setOffline(true);
    f.store.markOffline();
    expect(f.store.getState().connected).toBe(false);
    await f.store.enqueue("p", 1, "Cash");
    expect(f.store.available()[0]!.quantity).toBe(7);
    gate.release();
    await syncing;
    expect(f.store.pending().length).toBeGreaterThan(0);
  });
  it("persists before acknowledging, reserves stock and restores after restart", async () => {
    const f = await fixture();
    f.setOffline(true);
    const q = await f.store.enqueue("p", 2, "Cash");
    expect(f.disk()!.accounts["shop-a:cashier-a:cashier"]!.queue[0]!.id).toBe(q.id);
    expect(f.store.available()[0]!.quantity).toBe(8);
    await f.store.sync();
    expect(f.requests).toHaveLength(0);
    const reopened = createOnlineSync(f.deps);
    await reopened.restore();
    expect(reopened.pending()).toHaveLength(1);
    expect(reopened.available()[0]!.quantity).toBe(8);
    f.setOffline(false);
    await reopened.sync();
    expect(reopened.pending()).toHaveLength(0);
    expect(f.stock()).toBe(8);
  });
  it("retries a committed sale with the same body after a lost response and restart", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 2, "Cash");
    f.loseReply();
    await f.store.sync();
    expect(f.store.pending()).toHaveLength(1);
    expect(f.stock()).toBe(8);
    const reopened = createOnlineSync(f.deps);
    await reopened.restore();
    await reopened.sync();
    expect(f.requests[1]).toEqual(f.requests[0]);
    expect(f.accepted.size).toBe(1);
    expect(f.stock()).toBe(8);
    expect(reopened.pending()).toHaveLength(0);
  });
  it("does not acknowledge a sale when durable storage fails", async () => {
    const f = await fixture();
    f.failWrites(true);
    await expect(f.store.enqueue("p", 2, "Cash")).rejects.toThrow("Disk full");
    expect(f.store.pending()).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
    expect(f.store.available()[0]!.quantity).toBe(10);
  });
  it("serializes simultaneous local sales to prevent overselling cached stock", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      f.store.enqueue("p", 7, "Cash"),
      f.store.enqueue("p", 7, "Cash"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.store.available()[0]!.quantity).toBe(3);
  });
  it("keeps conflicts for review, retries unchanged and retains cancelled records", async () => {
    const f = await fixture();
    const q = await f.store.enqueue("p", 2, "Cash");
    f.reject(new OnlineError("Selling price changed", 409));
    await f.store.sync();
    expect(f.store.pending()[0]!.state).toBe("review");
    expect(f.store.available()[0]!.quantity).toBe(8);
    await f.store.review(q.id, "retry");
    await f.store.sync();
    expect(f.requests[1]).toEqual(f.requests[0]);
    await f.store.review(q.id, "cancel");
    expect(f.store.pending()).toHaveLength(0);
    expect(f.store.getState().cache.queue[0]!.state).toBe("cancelled");
    expect(f.store.available()[0]!.quantity).toBe(10);
  });
  it("keeps unknown network outcomes waiting and prevents cancelling them", async () => {
    const f = await fixture();
    const q = await f.store.enqueue("p", 2, "Cash");
    f.loseReply();
    await f.store.sync();
    await expect(f.store.review(q.id, "cancel")).rejects.toThrow("Only a rejected sale");
    await expect(f.store.signOut()).rejects.toThrow("pending sales");
    await expect(
      f.store.signIn({ ...session, user: { ...session.user, id: "other" } }),
    ).rejects.toThrow("pending sales");
  });
  it("blocks sending to an unexpected account and blocks further offline sales after rejection", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 2, "Cash");
    f.identity({ ...session.user, id: "other" });
    await f.store.sync();
    expect(f.requests).toHaveLength(0);
    expect(f.store.pending()).toHaveLength(1);
    await expect(f.store.enqueue("p", 1, "Cash")).rejects.toThrow("Session expired");
  });
  it("retains queued sales across expiry and restores them on same-account sign-in", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 2, "Cash");
    f.advance();
    await expect(f.store.enqueue("p", 1, "Cash")).rejects.toThrow("Session expired");
    const reopened = createOnlineSync(f.deps);
    await reopened.restore();
    expect(reopened.getState().session).toBeNull();
    await reopened.signIn({
      ...session,
      expiresAt: new Date(instant + 18 * 3600000).toISOString(),
    });
    expect(reopened.pending()).toHaveLength(1);
    await reopened.sync();
    expect(reopened.pending()).toHaveLength(0);
  });
  it("requires the updated server before transmitting offline requests", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 1, "Cash");
    f.version(0);
    await f.store.sync();
    expect(f.requests).toHaveLength(0);
    expect(f.store.pending()).toHaveLength(1);
    expect(f.store.getState().message).toMatch("Server update required");
  });
  it("allows a second local sale during an upload without losing either reservation", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 2, "Cash");
    const gate = f.holdSales();
    const syncing = f.store.sync();
    await gate.entered;
    await f.store.enqueue("p", 3, "Cash");
    expect(f.store.available()[0]!.quantity).toBe(5);
    gate.release();
    await syncing;
    expect(f.store.pending()).toHaveLength(1);
    expect(f.store.available()[0]!.quantity).toBe(5);
    await f.store.sync();
    expect(f.store.pending()).toHaveLength(0);
    expect(f.stock()).toBe(5);
  });
  it("survives a local write failure after the server committed and avoids overlapping syncs", async () => {
    const f = await fixture();
    await f.store.enqueue("p", 2, "Cash");
    f.failWrites(true);
    await f.store.sync();
    expect(f.stock()).toBe(8);
    expect(f.store.pending()).toHaveLength(1);
    f.failWrites(false);
    await Promise.all([f.store.sync(), f.store.sync(), f.store.sync()]);
    expect(f.accepted.size).toBe(1);
    expect(f.stock()).toBe(8);
    expect(f.store.pending()).toHaveLength(0);
    expect(f.requests).toHaveLength(2);
  });
});
