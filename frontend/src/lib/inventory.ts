// Pure business rules — no storage. A backend can reuse these rules.
import type { CartLine, PaymentMethod, Product, Sale, ShopData, StockAdjustment } from "./types";
import { uid } from "./format";

export const productQty = (p: Product) => p.variants.reduce((s, v) => s + v.quantity, 0);
export const productValue = (p: Product) => p.variants.reduce((s, v) => s + v.quantity * v.costPrice, 0);
export const isLowStock = (p: Product) => !p.archived && productQty(p) <= p.lowStockThreshold;

export interface SaleInput {
  lines: CartLine[];
  discount: number;
  payment: PaymentMethod;
  customerName?: string;
  customerPhone?: string;
  cashierId?: string | undefined;
  cashierName?: string | undefined;
  now?: Date;
}

/** Atomic: returns new data with stock deducted + sale recorded, or throws. */
export function applySale(data: ShopData, input: SaleInput): { data: ShopData; sale: Sale } {
  if (!input.lines.length) throw new Error("Add at least one item to the sale.");
  const need = new Map<string, number>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("Quantities must be whole numbers above zero.");
    need.set(l.variantId, (need.get(l.variantId) ?? 0) + l.quantity);
  }
  const items: Sale["items"] = [];
  for (const l of input.lines) {
    const p = data.products.find((x) => x.id === l.productId);
    const v = p?.variants.find((x) => x.id === l.variantId);
    if (!p || !v || p.archived) throw new Error("A product in this sale is not available.");
    if ((need.get(v.id) ?? 0) > v.quantity)
      throw new Error(`Only ${v.quantity} left of ${p.name} (${v.label}).`);
    items.push({
      productId: p.id, variantId: v.id, productName: p.name, variantLabel: v.label, categoryId: p.categoryId,
      sku: v.sku, quantity: l.quantity, unitPrice: v.sellingPrice, unitCost: v.costPrice,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discount = Math.min(Math.max(0, input.discount || 0), subtotal);
  const now = input.now ?? new Date();
  const sale: Sale = {
    id: uid("sale_"),
    number: "SW-" + now.getTime().toString(36).toUpperCase().slice(-7),
    createdAt: now.toISOString(),
    items, subtotal, discount, total: subtotal - discount,
    cogs: items.reduce((s, i) => s + i.quantity * i.unitCost, 0),
    payment: input.payment,
    customerName: input.customerName ?? "",
    customerPhone: input.customerPhone ?? "",
    cashierId: input.cashierId,
    cashierName: input.cashierName,
    status: "completed",
  };
  const products = data.products.map((p) => ({
    ...p,
    variants: p.variants.map((v) => (need.has(v.id) ? { ...v, quantity: v.quantity - need.get(v.id)! } : v)),
  }));
  return { data: { ...data, products, sales: [sale, ...data.sales] }, sale };
}

export function applyRefund(data: ShopData, saleId: string, restock: boolean, reason: string, now = new Date()): ShopData {
  const sale = data.sales.find((s) => s.id === saleId);
  if (!sale) throw new Error("Sale not found.");
  if (sale.status !== "completed") throw new Error("This sale has already been refunded.");
  let products = data.products;
  const adjustments: StockAdjustment[] = [];
  if (restock) {
    products = data.products.map((p) => ({
      ...p,
      variants: p.variants.map((v) => {
        const qty = sale.items.filter((i) => i.variantId === v.id).reduce((s, i) => s + i.quantity, 0);
        if (!qty) return v;
        adjustments.push({
          id: uid("adj_"), productId: p.id, variantId: v.id, productName: p.name, variantLabel: v.label,
          previous: v.quantity, change: qty, next: v.quantity + qty, at: now.toISOString(),
          reason: `Refund of ${sale.number}${reason ? ": " + reason : ""}`, type: "refund-restock",
        });
        return { ...v, quantity: v.quantity + qty };
      }),
    }));
  }
  const sales = data.sales.map((s) =>
    s.id === saleId ? { ...s, status: "refunded" as const, refund: { at: now.toISOString(), reason, restocked: restock } } : s,
  );
  return { ...data, products, sales, adjustments: [...adjustments, ...data.adjustments] };
}

export function applyAdjustment(
  data: ShopData, productId: string, variantId: string, change: number, reason: string, now = new Date(),
): ShopData {
  if (!Number.isInteger(change) || change === 0) throw new Error("Enter a whole number other than zero.");
  const p = data.products.find((x) => x.id === productId);
  const v = p?.variants.find((x) => x.id === variantId);
  if (!p || !v) throw new Error("Product not found.");
  if (v.quantity + change < 0) throw new Error(`Cannot remove more than ${v.quantity} units.`);
  const adj: StockAdjustment = {
    id: uid("adj_"), productId, variantId, productName: p.name, variantLabel: v.label,
    previous: v.quantity, change, next: v.quantity + change, at: now.toISOString(),
    reason: reason || (change > 0 ? "Restock" : "Manual removal"), type: change > 0 ? "restock" : "removal",
  };
  return {
    ...data,
    products: data.products.map((x) =>
      x.id !== productId ? x : { ...x, variants: x.variants.map((y) => (y.id === variantId ? { ...y, quantity: adj.next } : y)) },
    ),
    adjustments: [adj, ...data.adjustments],
  };
}
