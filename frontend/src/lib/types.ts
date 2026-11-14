export type ID = string;

export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  /** DEMO ONLY: a simple hash, not real security. */
  passwordHash: string;
  createdAt: string;
}

export interface ShopSettings {
  name: string;
  address: string;
  currency: "NGN";
  timezone: string;
  receiptNote: string;
}

export interface Category {
  id: ID;
  name: string;
  createdAt: string;
}

export interface Variant {
  id: ID;
  label: string; // e.g. "White / 42"
  sku: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
}

export interface Product {
  id: ID;
  name: string;
  image: string;
  categoryId: ID;
  brand: string;
  description: string;
  sku: string;
  supplier: string;
  model?: string | undefined;
  barcode?: string | undefined;
  archived?: boolean | undefined;
  updatedAt?: string | undefined;
  lowStockThreshold: number;
  createdAt: string;
  variants: Variant[];
}

export type PaymentMethod = "Cash" | "Transfer" | "POS" | "Other";

export interface SaleItem {
  productId: ID;
  variantId: ID;
  productName: string;
  variantLabel: string;
  categoryId: ID;
  sku: string;
  quantity: number;
  unitPrice: number;
  /** Cost captured at time of sale so historical profit never changes. */
  unitCost: number;
}

export interface Sale {
  id: ID;
  number: string;
  createdAt: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  cogs: number;
  payment: PaymentMethod;
  customerName: string;
  customerPhone: string;
  cashierId?: string | undefined;
  cashierName?: string | undefined;
  status: "completed" | "refunded";
  refund?: { at: string; reason: string; restocked: boolean };
}

export type AdjustmentType = "initial" | "restock" | "removal" | "refund-restock";

export interface StockAdjustment {
  id: ID;
  productId: ID;
  variantId: ID;
  productName: string;
  variantLabel: string;
  previous: number;
  change: number;
  next: number;
  at: string;
  reason: string;
  type: AdjustmentType;
}

export interface ShopData {
  shop: ShopSettings | null;
  categories: Category[];
  products: Product[];
  sales: Sale[];
  adjustments: StockAdjustment[];
  expenses: Expense[];
  staff: Staff[];
  audit: AuditEntry[];
  prefs: { theme: "light" | "dark"; autoLockMinutes: number; lastBackupAt?: string | undefined };
}

export type Role = "owner" | "cashier" | "inventory";

export interface Staff {
  id: ID;
  name: string;
  username: string;
  role: Exclude<Role, "owner">;
  /** DEMO ONLY hash. */
  passwordHash: string;
  active: boolean;
  createdAt: string;
}

export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Transportation", "Salaries", "Miscellaneous"] as const;
export interface Expense {
  id: ID;
  date: string;
  category: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface AuditEntry {
  id: ID;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface CartLine {
  productId: ID;
  variantId: ID;
  quantity: number;
}
