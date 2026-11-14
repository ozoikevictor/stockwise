import { describe, expect, it } from "vitest";
import { applyAdjustment, applyRefund, applySale } from "@/lib/inventory";
import { emptyShopData } from "@/lib/seed";
import type { ShopData } from "@/lib/types";

const mk = (id: string, qty: number, cost: number, sell: number) => ({
  id, name: id, image: "", categoryId: "c", brand: "", description: "", sku: id, supplier: "", lowStockThreshold: 2, createdAt: "",
  variants: [{ id: id + "v", label: "Std", sku: id + "1", costPrice: cost, sellingPrice: sell, quantity: qty }],
});
const base = (): ShopData => ({ ...emptyShopData(), products: [mk("nike", 50, 15000, 25000), mk("clothes", 100, 3000, 6000), mk("airpods", 25, 100000, 150000)] });
const qty = (d: ShopData, id: string) => d.products.find((p) => p.id === id)!.variants[0]!.quantity;

describe("sales deduct stock", () => {
  it("deducts 3 Nike, 10 clothes, 2 AirPods in one sale", () => {
    const { data } = applySale(base(), { payment: "Cash", discount: 0, lines: [
      { productId: "nike", variantId: "nikev", quantity: 3 },
      { productId: "clothes", variantId: "clothesv", quantity: 10 },
      { productId: "airpods", variantId: "airpodsv", quantity: 2 },
    ] });
    expect([qty(data, "nike"), qty(data, "clothes"), qty(data, "airpods")]).toEqual([47, 90, 23]);
    expect(data.sales).toHaveLength(1);
  });
  it("blocks selling more than available", () => {
    expect(() => applySale(base(), { payment: "Cash", discount: 0, lines: [{ productId: "airpods", variantId: "airpodsv", quantity: 26 }] })).toThrow();
  });
  it("computes revenue 75,000, COGS 45,000, gross profit 30,000 for 3 shoes", () => {
    const { sale } = applySale(base(), { payment: "Cash", discount: 0, lines: [{ productId: "nike", variantId: "nikev", quantity: 3 }] });
    expect([sale.total, sale.cogs, sale.total - sale.cogs]).toEqual([75000, 45000, 30000]);
  });
});

describe("restock and refunds", () => {
  it("restocking 20 onto 47 gives 67", () => {
    const { data } = applySale(base(), { payment: "Cash", discount: 0, lines: [{ productId: "nike", variantId: "nikev", quantity: 3 }] });
    expect(qty(applyAdjustment(data, "nike", "nikev", 20, "Delivery"), "nike")).toBe(67);
  });
  it("cannot refund (and restock) the same sale twice", () => {
    const { data, sale } = applySale(base(), { payment: "Cash", discount: 0, lines: [{ productId: "nike", variantId: "nikev", quantity: 3 }] });
    const once = applyRefund(data, sale.id, true, "");
    expect(qty(once, "nike")).toBe(50);
    expect(() => applyRefund(once, sale.id, true, "")).toThrow();
  });
});
