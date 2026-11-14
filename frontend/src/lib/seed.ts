import type { Category, Product, Sale, ShopData, StockAdjustment } from "./types";
import { addDays, uid } from "./format";
import { applySale } from "./inventory";

export const emptyShopData = (): ShopData => ({
  shop: null, categories: [], products: [], sales: [], adjustments: [], expenses: [], staff: [], audit: [], prefs: { theme: "light", autoLockMinutes: 0 },
});

const CATS = ["Shoes", "Clothes", "Electronics", "Phone Accessories", "Perfumes", "Bags", "Books", "Watches", "Cosmetics", "Other Products"];

type V = [label: string, cost: number, sell: number, qty: number];
const P: [name: string, cat: string, brand: string, desc: string, supplier: string, low: number, variants: V[]][] = [
  ["Nike Air Force 1", "Shoes", "Nike", "Classic low-top sneakers.", "Balogun Market Wholesale", 8, [["White / 42", 15000, 25000, 15], ["Black / 43", 15000, 25000, 20], ["White / 44", 15000, 25000, 15]]],
  ["Adidas Slides", "Shoes", "Adidas", "Comfortable everyday slides.", "Trade Fair Lagos", 5, [["Black / 41", 6000, 10500, 18], ["Blue / 43", 6000, 10500, 10]]],
  ["Ankara Shirt", "Clothes", "Zaron Fabrics", "Hand-tailored Ankara short sleeve shirt.", "Aba Tailors Hub", 10, [["M", 5500, 12000, 40], ["L", 5500, 12000, 35], ["XL", 6000, 13000, 25]]],
  ["Plain Polo Tee", "Clothes", "Lacoste", "Cotton polo t-shirt.", "Yaba Market", 10, [["White / L", 3500, 7500, 30], ["Navy / L", 3500, 7500, 25]]],
  ["Apple AirPods Pro", "Electronics", "Apple", "Wireless earbuds with ANC.", "Computer Village Ikeja", 5, [["2nd Gen", 145000, 210000, 25]]],
  ["Oraimo 20W Charger", "Phone Accessories", "Oraimo", "Fast USB-C wall charger.", "Computer Village Ikeja", 6, [["USB-C", 4500, 8500, 3]]],
  ["Oraimo PowerBank 20000mAh", "Phone Accessories", "Oraimo", "High capacity power bank.", "Computer Village Ikeja", 5, [["Black", 11000, 18500, 14]]],
  ["Dior Sauvage EDP", "Perfumes", "Dior", "100ml eau de parfum.", "Lekki Scents Ltd", 3, [["100ml", 62000, 95000, 1]]],
  ["Arabian Oud Spray", "Perfumes", "Lattafa", "Long-lasting oud fragrance.", "Lekki Scents Ltd", 4, [["100ml", 9000, 16000, 12]]],
  ["Leather Office Bag", "Bags", "Kaduna Leather", "Handmade leather laptop bag.", "Kano Leather Works", 3, [["Brown", 18000, 32000, 9], ["Black", 18000, 32000, 7]]],
  ["Things Fall Apart", "Books", "Penguin", "Chinua Achebe classic novel.", "CSS Bookshop", 5, [["Paperback", 3200, 6000, 22]]],
  ["Casio Wrist Watch", "Watches", "Casio", "Digital stainless watch.", "Idumota Traders", 4, [["Silver", 14000, 24000, 2]]],
  ["Shea Butter Cream", "Cosmetics", "Naija Glow", "Organic shea body cream.", "Kano Shea Co-op", 8, [["250g", 2000, 4500, 30]]],
];

/** Simple seeded PRNG so demo data looks consistent. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function buildSampleData(prefs: ShopData["prefs"], shop: ShopData["shop"]): ShopData {
  const now = new Date();
  const created = addDays(now, -42).toISOString();
  const categories: Category[] = CATS.map((name) => ({ id: uid("cat_"), name, createdAt: created }));
  const catId = (n: string) => categories.find((c) => c.name === n)!.id;
  const adjustments: StockAdjustment[] = [];
  const products: Product[] = P.map(([name, cat, brand, desc, supplier, low, vs], i) => {
    const pid = uid("prd_");
    const base = brand.slice(0, 3).toUpperCase() + "-" + String(100 + i);
    const variants = vs.map(([label, cost, sell, qty], j) => ({
      id: uid("var_"), label, sku: `${base}-${j + 1}`, costPrice: cost, sellingPrice: sell, quantity: qty + 40,
    }));
    variants.forEach((v) =>
      adjustments.push({ id: uid("adj_"), productId: pid, variantId: v.id, productName: name, variantLabel: v.label,
        previous: 0, change: v.quantity, next: v.quantity, at: created, reason: "Initial stock", type: "initial" }),
    );
    return { id: pid, name, image: "", categoryId: catId(cat), brand, description: desc, sku: base, supplier,
      lowStockThreshold: low, createdAt: created, variants };
  });

  let data: ShopData = { ...emptyShopData(), shop, categories, products, sales: [] as Sale[], adjustments, prefs };
  const r = rng(42);
  const pays = ["Cash", "Transfer", "POS", "Transfer"] as const;
  // Generate ~5 weeks of past sales, oldest first, respecting stock.
  for (let d = 35; d >= 0; d--) {
    const day = addDays(now, -d);
    const isSunday = day.getDay() === 0;
    const count = isSunday ? Math.floor(r() * 2) : 1 + Math.floor(r() * 4);
    for (let k = 0; k < count; k++) {
      const t = new Date(day);
      t.setHours(9 + Math.floor(r() * 9), Math.floor(r() * 60), 0, 0);
      if (t > now) continue;
      const lines: { productId: string; variantId: string; quantity: number }[] = [];
      const n = 1 + Math.floor(r() * 2);
      for (let q = 0; q < n; q++) {
        const p = data.products[Math.floor(r() * data.products.length)];
        const v = p?.variants[Math.floor(r() * p.variants.length)];
        if (!p || !v) continue;
        if (lines.some((l) => l.variantId === v.id)) continue;
        const want = 1 + Math.floor(r() * 3);
        if (v.quantity - want < 1) continue;
        lines.push({ productId: p.id, variantId: v.id, quantity: want });
      }
      if (!lines.length) continue;
      try {
        data = applySale(data, { lines, discount: r() > 0.85 ? 1000 : 0, payment: pays[Math.floor(r() * 4)] ?? "Cash", now: t }).data;
      } catch { /* skip */ }
    }
  }
  // Bring certain items down to demo low stock levels via the recorded quantities
  const countDate = addDays(now, -1);
  countDate.setHours(20, 0, 0, 0);
  data.products = data.products.map((p) => {
    const target = P.find((x) => x[0] === p.name)![6];
    return { ...p, variants: p.variants.map((v, j) => {
      const next = Math.min(v.quantity, target[j]?.[3] ?? v.quantity);
      if (next !== v.quantity)
        data.adjustments.unshift({ id: uid("adj_"), productId: p.id, variantId: v.id, productName: p.name, variantLabel: v.label,
          previous: v.quantity, change: next - v.quantity, next, at: countDate.toISOString(),
          reason: "Stock count correction (damaged / transferred)", type: "removal" });
      return { ...v, quantity: next };
    }) };
  });
  data.sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  data.sales = data.sales.map((s) => ({ ...s, cashierName: "Owner" }));
  const exp: [number, string, number, string][] = [[30, "Rent", 150000, "Shop rent"], [20, "Electricity", 18000, "Prepaid meter"], [12, "Transportation", 9500, "Goods pickup from Balogun"], [6, "Salaries", 60000, "Sales assistant"], [2, "Miscellaneous", 4000, "Nylon bags"]];
  data.expenses = exp.map(([d, category, amount, note]) => ({ id: uid("exp_"), date: addDays(now, -d).toISOString(), category, amount, note, createdAt: created }));
  return data;
}
