import type { AuditEntry, CartLine, Category, Expense, PaymentMethod, Product, Role, Sale, ShopData, ShopSettings, Staff, User } from "./types";
import { uid } from "./format";
import { applyAdjustment, applyRefund, applySale } from "./inventory";
import { buildSampleData, emptyShopData } from "./seed";
import { can, type Perm } from "./permissions";

export interface AuthState { users: User[]; sessionUserId: string | null }
export interface Actor { kind: "owner" | "staff"; id: string; name: string; role: Role }
export interface State { ready: boolean; auth: AuthState; data: ShopData; actor: Actor | null; locked: boolean }


export interface StoreAdapter {
  storage: { read<T>(key: string): T | null; write(key: string, value: unknown): void; remove(key: string): void };
  hashPassword(password: string): string;
  verifyPassword(password: string, encoded: string): boolean;
  applyTheme?(theme: "light" | "dark"): void;
}

export function createStoreCore(adapter: StoreAdapter) {
const storage = adapter.storage;
const AUTH_KEY = "stockwise:auth:v1";
const shopKey = (userId: string) => `stockwise:shop:v1:${userId}`;
const actorKey = (userId: string) => `stockwise:actor:v1:${userId}`;

const SERVER_STATE: State = { ready: false, auth: { users: [], sessionUserId: null }, data: emptyShopData(), actor: null, locked: false };
let state: State = SERVER_STATE;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function applyTheme(t: "light" | "dark") { adapter.applyTheme?.(t); }
/** Fill in fields added in later versions so older saved data keeps working. */
function migrate(d: Partial<ShopData> | null): ShopData {
  const e = emptyShopData();
  return { ...e, ...d, prefs: { ...e.prefs, ...(d?.prefs ?? {}) } } as ShopData;
}
function ownerActor(u: User): Actor { return { kind: "owner", id: u.id, name: u.name, role: "owner" }; }

function loadFor(userId: string) {
  const data = migrate(storage.read<ShopData>(shopKey(userId)));
  const user = state.auth.users.find((u) => u.id === userId);
  const saved = storage.read<{ actor: Actor; locked: boolean }>(actorKey(userId));
  let actor: Actor | null = user ? ownerActor(user) : null;
  if (saved?.actor.kind === "staff") {
    const s = data.staff.find((x) => x.id === saved.actor.id && x.active);
    actor = s ? { kind: "staff", id: s.id, name: s.name, role: s.role } : actor;
  }
  state = { ...state, data, actor, locked: !!saved?.locked };
  applyTheme(data.prefs.theme);
}

function init() {
  if (state.ready) return;
  const auth = storage.read<AuthState>(AUTH_KEY) ?? { users: [], sessionUserId: null };
  state = { ...SERVER_STATE, ready: true, auth };
  if (auth.sessionUserId) loadFor(auth.sessionUserId);
}

function setAuth(auth: AuthState) { state = { ...state, auth }; storage.write(AUTH_KEY, auth); emit(); }
function saveActor() {
  const u = state.auth.sessionUserId;
  if (u && state.actor) storage.write(actorKey(u), { actor: state.actor, locked: state.locked });
}
function setData(data: ShopData) {
  const uidv = state.auth.sessionUserId;
  if (!uidv) throw new Error("Not signed in.");
  state = { ...state, data };
  storage.write(shopKey(uidv), data);
  applyTheme(data.prefs.theme);
  emit();
}
function needSignedIn() { if (!state.actor || state.locked) throw new Error("Please sign in."); }
function needPerm(perm: Perm) {
  if (!state.actor || state.locked) throw new Error("Please sign in.");
  if (!can(state.actor.role, perm)) throw new Error("You don't have permission to do that.");
}
function audit(d: ShopData, action: string, detail: string): ShopData {
  const e: AuditEntry = { id: uid("aud_"), at: new Date().toISOString(), actor: state.actor?.name ?? "System", action, detail };
  return { ...d, audit: [e, ...d.audit].slice(0, 2000) };
}

const actions = {
  addTestProduct(): Product {
    needPerm("manageProducts");
    const existing = state.data.products.find((p) => p.sku === "SW-TEST-001");
    if (existing) throw new Error("Test product already exists. Search for StockWise Test Product; its stock has not been reset.");
    const category = state.data.categories.find((c) => c.name === "Test Products") ?? actions.addCategory("Test Products");
    return actions.saveProduct({
      name: "StockWise Test Product", sku: "SW-TEST-001", image: "", categoryId: category.id,
      brand: "StockWise", description: "Test sale: sell 2 units for NGN 3,000 total and NGN 1,000 gross profit. Starting stock: 10.",
      supplier: "Test supplier", lowStockThreshold: 2,
      variants: [{ id: "", label: "Standard", sku: "SW-TEST-001-STD", costPrice: 1000, sellingPrice: 1500, quantity: 10 }],
    });
  },
  register(input: { name: string; email: string; phone: string; password: string }) {
    init();
    const email = input.email.trim().toLowerCase();
    if (state.auth.users.some((u) => u.email === email)) throw new Error("An account with this email already exists.");
    const user: User = { id: uid("usr_"), name: input.name.trim(), email, phone: input.phone.trim(),
      passwordHash: adapter.hashPassword(input.password), createdAt: new Date().toISOString() };
    setAuth({ users: [...state.auth.users, user], sessionUserId: user.id });
    state = { ...state, data: emptyShopData(), actor: ownerActor(user), locked: false };
    storage.write(shopKey(user.id), state.data);
    saveActor();
    emit();
    return user;
  },
  login(email: string, password: string) {
    init();
    const u = state.auth.users.find((x) => x.email === email.trim().toLowerCase());
    if (!u || !adapter.verifyPassword(password, u.passwordHash)) throw new Error("Incorrect email or password.");
    setAuth({ ...state.auth, sessionUserId: u.id });
    loadFor(u.id);
    state = { ...state, actor: ownerActor(u), locked: false };
    saveActor();
    emit();
    return { hasShop: !!state.data.shop };
  },
  logout() {
    const u = state.auth.sessionUserId;
    if (u) storage.remove(actorKey(u));
    setAuth({ ...state.auth, sessionUserId: null });
    state = { ...state, data: emptyShopData(), actor: null, locked: false };
    applyTheme("light");
    emit();
  },
  lock() { needSignedIn(); state = { ...state, locked: true }; saveActor(); emit(); },
  /** Unlock as the owner or any active staff member (switch user). */
  unlock(who: string, password: string): Role {
    const user = state.auth.users.find((u) => u.id === state.auth.sessionUserId);
    if (!user) throw new Error("Not signed in.");
    if (who === "owner") {
      if (!adapter.verifyPassword(password, user.passwordHash)) throw new Error("Incorrect password.");
      state = { ...state, actor: ownerActor(user), locked: false };
    } else {
      const s = state.data.staff.find((x) => x.id === who && x.active);
      if (!s || !adapter.verifyPassword(password, s.passwordHash)) throw new Error("Incorrect password.");
      state = { ...state, actor: { kind: "staff", id: s.id, name: s.name, role: s.role }, locked: false };
    }
    saveActor();
    setData(audit(state.data, "Sign in", state.actor!.name));
    return state.actor!.role;
  },
  changeOwnerPassword(current: string, next: string) {
    needPerm("manageSettings");
    const users = state.auth.users.map((u) => {
      if (u.id !== state.auth.sessionUserId) return u;
      if (!adapter.verifyPassword(current, u.passwordHash)) throw new Error("Current password is incorrect.");
      return { ...u, passwordHash: adapter.hashPassword(next) };
    });
    setAuth({ ...state.auth, users });
    setData(audit(state.data, "Password changed", "Owner"));
  },

  setupShop(shop: ShopSettings, withSample: boolean) {
    needPerm("manageSettings");
    const d = state.data;
    setData(withSample ? buildSampleData(d.prefs, shop) : { ...d, shop });
  },
  updateShop(shop: ShopSettings) { needPerm("manageSettings"); setData(audit({ ...state.data, shop }, "Settings updated", shop.name)); },
  setTheme(theme: "light" | "dark") { needSignedIn(); setData({ ...state.data, prefs: { ...state.data.prefs, theme } }); },
  setAutoLock(minutes: number) { needPerm("manageSettings"); setData({ ...state.data, prefs: { ...state.data.prefs, autoLockMinutes: minutes } }); },

  addCategory(name: string): Category {
    needPerm("manageProducts");
    const n = name.trim();
    if (!n) throw new Error("Category name is required.");
    if (state.data.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) throw new Error("Category already exists.");
    const c = { id: uid("cat_"), name: n, createdAt: new Date().toISOString() };
    setData(audit({ ...state.data, categories: [...state.data.categories, c] }, "Category added", n));
    return c;
  },
  renameCategory(id: string, name: string) {
    needPerm("manageProducts");
    setData({ ...state.data, categories: state.data.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) });
  },
  deleteCategory(id: string) {
    needPerm("manageProducts");
    if (state.data.products.some((p) => p.categoryId === id)) throw new Error("Move or delete this category's products first.");
    setData({ ...state.data, categories: state.data.categories.filter((c) => c.id !== id) });
  },

  saveProduct(p: Omit<Product, "id" | "createdAt"> & { id?: string | undefined }) {
    needPerm("manageProducts");
    const d = state.data;
    const now = new Date().toISOString();
    const existing = p.id ? d.products.find((x) => x.id === p.id) : undefined;
    const product: Product = { ...p, id: existing?.id ?? uid("prd_"), createdAt: existing?.createdAt ?? now, updatedAt: now,
      archived: existing?.archived ?? false,
      variants: p.variants.map((v) => ({ ...v, id: v.id || uid("var_") })) };
    const adjustments = [...d.adjustments];
    // Stock for existing variants only changes via restock; new variants log an initial-stock record.
    product.variants = product.variants.map((v) => {
      const old = existing?.variants.find((o) => o.id === v.id);
      if (old) return { ...v, quantity: old.quantity };
      if (v.quantity > 0)
        adjustments.unshift({ id: uid("adj_"), productId: product.id, variantId: v.id, productName: product.name,
          variantLabel: v.label, previous: 0, change: v.quantity, next: v.quantity, at: now, reason: "Initial stock", type: "initial" });
      return v;
    });
    const products = existing ? d.products.map((x) => (x.id === product.id ? product : x)) : [product, ...d.products];
    setData(audit({ ...d, products, adjustments }, existing ? "Product edited" : "Product added", product.name));
    return product;
  },
  setArchived(id: string, archived: boolean) {
    needPerm("manageProducts");
    const p = state.data.products.find((x) => x.id === id);
    setData(audit({ ...state.data, products: state.data.products.map((x) => (x.id === id ? { ...x, archived } : x)) },
      archived ? "Product archived" : "Product restored", p?.name ?? id));
  },
  deleteProduct(id: string) {
    needPerm("manageProducts");
    const p = state.data.products.find((x) => x.id === id);
    setData(audit({ ...state.data, products: state.data.products.filter((x) => x.id !== id) }, "Product deleted", p?.name ?? id));
  },
  adjustStock(productId: string, variantId: string, change: number, reason: string) {
    needPerm("manageStock");
    const p = state.data.products.find((x) => x.id === productId);
    setData(audit(applyAdjustment(state.data, productId, variantId, change, reason), "Stock adjusted", `${p?.name}: ${change > 0 ? "+" : ""}${change} (${reason})`));
  },
  recordSale(input: { lines: CartLine[]; discount: number; payment: PaymentMethod; customerName?: string; customerPhone?: string }): Sale {
    needPerm("sell");
    const { data, sale } = applySale(state.data, { ...input, cashierId: state.actor!.id, cashierName: state.actor!.name }); // atomic: one state write
    setData(audit(data, "Sale recorded", `${sale.number} · ₦${sale.total}`));
    return sale;
  },
  refundSale(id: string, restock: boolean, reason: string) {
    needPerm("refund");
    const s = state.data.sales.find((x) => x.id === id);
    setData(audit(applyRefund(state.data, id, restock, reason), "Sale refunded", `${s?.number}${restock ? " (restocked)" : ""}`));
  },

  addExpense(e: Omit<Expense, "id" | "createdAt">) {
    needPerm("manageExpenses");
    if (!(e.amount > 0)) throw new Error("Enter an amount above zero.");
    const x: Expense = { ...e, id: uid("exp_"), createdAt: new Date().toISOString() };
    setData(audit({ ...state.data, expenses: [x, ...state.data.expenses] }, "Expense added", `${e.category} ₦${e.amount}`));
  },
  deleteExpense(id: string) {
    needPerm("manageExpenses");
    setData(audit({ ...state.data, expenses: state.data.expenses.filter((x) => x.id !== id) }, "Expense deleted", id));
  },

  addStaff(input: { name: string; username: string; role: Staff["role"]; password: string }) {
    needPerm("manageStaff");
    const username = input.username.trim().toLowerCase();
    if (state.data.staff.some((s) => s.username === username)) throw new Error("That username is taken.");
    const s: Staff = { id: uid("stf_"), name: input.name.trim(), username, role: input.role, passwordHash: adapter.hashPassword(input.password), active: true, createdAt: new Date().toISOString() };
    setData(audit({ ...state.data, staff: [...state.data.staff, s] }, "Staff added", `${s.name} (${s.role})`));
  },
  updateStaff(id: string, patch: Partial<Pick<Staff, "role" | "active">> & { password?: string }) {
    needPerm("manageStaff");
    const staff = state.data.staff.map((s) => s.id !== id ? s : {
      ...s, ...(patch.role ? { role: patch.role } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.password ? { passwordHash: adapter.hashPassword(patch.password) } : {}),
    });
    setData(audit({ ...state.data, staff }, "Staff updated", staff.find((s) => s.id === id)?.name ?? id));
  },

  loadSampleData() { needPerm("manageData"); setData(buildSampleData(state.data.prefs, state.data.shop)); },
  clearData() { needPerm("manageData"); setData(audit({ ...emptyShopData(), shop: state.data.shop, prefs: state.data.prefs, staff: state.data.staff }, "Data cleared", "")); },
  exportJSON() {
    needPerm("manageData");
    setData(audit({ ...state.data, prefs: { ...state.data.prefs, lastBackupAt: new Date().toISOString() } }, "Backup exported", ""));
    return JSON.stringify({ app: "StockWise", version: 2, exportedAt: new Date().toISOString(), data: state.data }, null, 2); },
  importJSON(text: string) {
    needPerm("manageData");
    const parsed = JSON.parse(text);
    const d = parsed?.data as ShopData;
    if (!d || !Array.isArray(d.products) || !Array.isArray(d.sales)) throw new Error("This file is not a StockWise export.");
    setData(audit(migrate(d), "Data imported", ""));
  },
};

return {
  actions,
  getState() { init(); return state; },
  restore(snapshot: State) { state = snapshot; },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
}
export type StoreActions = ReturnType<typeof createStoreCore>["actions"];
