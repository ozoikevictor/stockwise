import { publicReply } from "./public-state";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createStoreCore, type State } from "../../frontend/src/lib/store-core";

const text = z.string().max(10000);
const id = z.string().min(1).max(200);
const password = z.string().min(6).max(128);
const money = z.number().finite().min(0).max(1e12);
const quantity = z.number().int().min(0).max(1e9);
const shop = z.object({ name: text.min(2), address: text, currency: z.literal("NGN"), timezone: text, receiptNote: text });
const role = z.enum(["cashier", "inventory"]);
const variant = z.object({ id: text, label: text.min(1), sku: text, costPrice: money, sellingPrice: money, quantity });
const product = z.object({ id: id.optional(), name: text.min(1), image: z.string().max(5_000_000), categoryId: id, brand: text, description: text, sku: text, supplier: text, model: text.optional(), barcode: text.optional(), lowStockThreshold: quantity, variants: z.array(variant).min(1).max(1000) });
const schemas: Record<string, z.ZodTypeAny> = {
  register: z.tuple([z.object({ name: text.min(2), email: z.string().email().max(254), phone: text, password })]),
  login: z.tuple([z.string().email().max(254), z.string().max(128)]),
  logout: z.tuple([]), lock: z.tuple([]), unlock: z.tuple([id, z.string().max(128)]),
  changeOwnerPassword: z.tuple([z.string().max(128), password]),
  setupShop: z.tuple([shop, z.boolean()]), updateShop: z.tuple([shop]),
  setTheme: z.tuple([z.enum(["light", "dark"])]), setAutoLock: z.tuple([quantity]),
  addCategory: z.tuple([text.min(1)]), renameCategory: z.tuple([id, text.min(1)]), deleteCategory: z.tuple([id]),
  saveProduct: z.tuple([product]), setArchived: z.tuple([id, z.boolean()]), deleteProduct: z.tuple([id]),
  adjustStock: z.tuple([id, id, z.number().int().min(-1e9).max(1e9), text]),
  recordSale: z.tuple([z.object({ lines: z.array(z.object({ productId: id, variantId: id, quantity: quantity.min(1) })).min(1).max(1000), discount: money, payment: z.enum(["Cash", "Transfer", "POS", "Other"]), customerName: text.optional(), customerPhone: text.optional() })]),
  refundSale: z.tuple([id, z.boolean(), text]),
  addExpense: z.tuple([z.object({ date: text, category: text.min(1), amount: money.positive(), note: text })]),
  deleteExpense: z.tuple([id]),
  addStaff: z.tuple([z.object({ name: text.min(1), username: text.min(1), role, password })]),
  updateStaff: z.tuple([id, z.object({ role: role.optional(), active: z.boolean().optional(), password: password.optional() })]),
  addTestProduct: z.tuple([]), loadSampleData: z.tuple([]), clearData: z.tuple([]), exportJSON: z.tuple([]),
  importJSON: z.tuple([z.string().max(50_000_000)]),
};

function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(value, salt, 64).toString("hex")}`;
}
function verifyPassword(value: string, encoded: string) {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digest || !/^[a-f0-9]{128}$/.test(digest)) return false;
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(digest, "hex"));
}

function redact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => key === "passwordHash" ? "" : v)) as T;
}

export function openBackend(filename: string) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;");
  const read = db.prepare("SELECT value FROM records WHERE key = ?");
  const write = db.prepare("INSERT INTO records(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const remove = db.prepare("DELETE FROM records WHERE key = ?");
  const core = createStoreCore({
    storage: {
      read<T>(key: string): T | null { const row = read.get(key); return row ? JSON.parse(row["value"] as string) as T : null; },
      write(key, value) { write.run(key, JSON.stringify(value)); },
      remove(key) { remove.run(key); },
    },
    hashPassword, verifyPassword,
  });
  core.getState();
  // Relaunches always require a password, even if the last window was left unlocked.
  if (core.getState().actor && !core.getState().locked) core.actions.lock();
  let failures = 0;
  let retryAfter = 0;
  return {
    request(command: string, args: unknown[] = []) {
      const before = core.getState();
      let transaction = false;
      try {
        if (command === "snapshot") return { ok: true, ...publicReply(core.getState()) };
        if (!Object.hasOwn(schemas, command)) throw new Error("Unknown operation.");
        const parsed = schemas[command]!.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid ${command} input: ${parsed.error.issues[0]?.message}`);
        const authenticating = command === "login" || command === "unlock";
        if (authenticating && Date.now() < retryAfter) throw new Error("Too many attempts. Wait 30 seconds and try again.");
        if (command === "importJSON") {
          const backup = JSON.parse(parsed.data[0]);
          if (backup.app !== "StockWise" || ![1, 2].includes(backup.version)) throw new Error("Not a supported StockWise backup.");
          const data = backup.data;
          if (!Array.isArray(data?.products) || !Array.isArray(data?.sales) || !Array.isArray(data?.staff)) throw new Error("Incomplete backup.");
          data.products.forEach((p: unknown) => product.passthrough().parse(p));
          // Demo hashes cannot authenticate desktop staff. Owner sets new passwords after import.
          data.staff = data.staff.map((s: Record<string, unknown>) => {
            if (typeof s["passwordHash"] === "string" && s["passwordHash"].startsWith("scrypt$")) return s;
            return { ...s, active: false, passwordHash: hashPassword(randomBytes(32).toString("hex")) };
          });
          parsed.data[0] = JSON.stringify(backup);
        }
        db.exec("BEGIN IMMEDIATE"); transaction = true;
        const action = core.actions[command as keyof typeof core.actions] as (...values: unknown[]) => unknown;
        const result = action(...parsed.data);
        db.exec("COMMIT"); transaction = false;
        if (authenticating) { failures = 0; retryAfter = 0; }
        return { ok: true, ...publicReply(core.getState(), result) };
      } catch (error) {
        if (transaction) db.exec("ROLLBACK");
        core.restore(before);
        if (command === "login" || command === "unlock") {
          failures++;
          if (failures >= 5) retryAfter = Date.now() + 30_000;
        }
        return { ok: false, error: error instanceof Error ? error.message : "Local database operation failed." };
      }
    },
    backup(destination: string) {
      const state = core.getState();
      if (!state.actor || state.locked || state.actor.role !== "owner") throw new Error("Sign in as the owner to back up the database.");
      db.prepare("VACUUM INTO ?").run(destination);
    },
    receipt(saleId: string) {
      const state = core.getState();
      if (!state.actor || state.locked || !["owner", "cashier"].includes(state.actor.role)) throw new Error("Please sign in as an owner or cashier.");
      const sale = state.data.sales.find((s) => s.id === saleId);
      if (!sale || (state.actor.role === "cashier" && sale.cashierId !== state.actor.id)) throw new Error("Receipt not available.");
      const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const amount = (value: number) => `NGN ${value.toLocaleString("en-NG")}`;
      return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(sale.number)}</title><style>body{font:14px monospace;padding:20px}table{width:100%}td{padding:8px 0}td:last-child{text-align:right}h1{font-size:20px}hr{border:0;border-top:1px dashed}</style></head><body><h1>${escape(state.data.shop?.name ?? "StockWise")}</h1><p>${escape(state.data.shop?.address ?? "")}</p><p>${escape(sale.number)} / ${escape(sale.createdAt)}</p>${sale.status === "refunded" ? "<b>REFUNDED</b>" : ""}<hr><table>${sale.items.map((item) => `<tr><td>${escape(item.productName)} / ${escape(item.variantLabel)}<br>${item.quantity} x ${amount(item.unitPrice)}</td><td>${amount(item.quantity * item.unitPrice)}</td></tr>`).join("")}<tr><td>Subtotal</td><td>${amount(sale.subtotal)}</td></tr><tr><td>Discount</td><td>${amount(sale.discount)}</td></tr><tr><td><b>Total</b></td><td><b>${amount(sale.total)}</b></td></tr></table><p>Paid by ${escape(sale.payment)}</p><p>${escape(sale.customerName)}</p><hr><p>${escape(state.data.shop?.receiptNote ?? "Thank you!")}</p></body></html>`;
    },
    automaticBackup(destination: string) { db.prepare("VACUUM INTO ?").run(destination); },
    close() { db.close(); },
  };
}

