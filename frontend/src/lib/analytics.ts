import type { Sale, ShopData } from "./types";
import { addDays, dayKey, startOfDay, startOfMonth, startOfWeek, WEEKDAYS } from "./format";

export const completed = (sales: Sale[]) => sales.filter((s) => s.status === "completed");

export function inRange(sales: Sale[], from: Date, to: Date) {
  const a = from.getTime(), b = to.getTime();
  return completed(sales).filter((s) => { const t = new Date(s.createdAt).getTime(); return t >= a && t < b; });
}

export function summarize(sales: Sale[]) {
  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const cogs = sales.reduce((s, x) => s + x.cogs, 0);
  const units = sales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.quantity, 0), 0);
  return { revenue, cogs, profit: revenue - cogs, units, transactions: sales.length };
}

export type RangeKey = "today" | "yesterday" | "week" | "lastweek" | "month" | "lastmonth" | "custom";
export function rangeFor(key: RangeKey, custom?: { from?: Date | undefined; to?: Date | undefined } | undefined, now = new Date()): [Date, Date] {
  const today = startOfDay(now);
  switch (key) {
    case "today": return [today, addDays(today, 1)];
    case "yesterday": return [addDays(today, -1), today];
    case "week": return [startOfWeek(now), addDays(startOfWeek(now), 7)];
    case "lastweek": return [addDays(startOfWeek(now), -7), startOfWeek(now)];
    case "lastmonth": return [new Date(now.getFullYear(), now.getMonth() - 1, 1), startOfMonth(now)];
    case "month": return [startOfMonth(now), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    case "custom": {
      const f = custom?.from ? startOfDay(custom.from) : today;
      const t = custom?.to ? addDays(startOfDay(custom.to), 1) : addDays(f, 1);
      return [f, t];
    }
  }
}

/** Monday–Sunday totals for the week containing `ref`. Always 7 rows; empty days = 0. */
export function weekByDay(sales: Sale[], ref: Date) {
  const start = startOfWeek(ref);
  return WEEKDAYS.map((name, i) => {
    const d = addDays(start, i);
    const s = inRange(sales, d, addDays(d, 1));
    return { day: name, short: name.slice(0, 3), date: d, key: dayKey(d), ...summarize(s) };
  });
}

export function weeklyTrend(sales: Sale[], weeks = 8, now = new Date()) {
  const cur = startOfWeek(now);
  return Array.from({ length: weeks }, (_, i) => {
    const s = addDays(cur, -7 * (weeks - 1 - i));
    const sum = summarize(inRange(sales, s, addDays(s, 7)));
    return { label: s.toLocaleDateString("en-NG", { day: "numeric", month: "short" }), ...sum };
  });
}

export function monthlyTrend(sales: Sale[], months = 6, now = new Date()) {
  return Array.from({ length: months }, (_, i) => {
    const s = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return { label: s.toLocaleDateString("en-NG", { month: "short", year: "2-digit" }), ...summarize(inRange(sales, s, e)) };
  });
}

export function productPerformance(data: ShopData, sales: Sale[]) {
  const map = new Map<string, { productId: string; name: string; units: number; revenue: number; profit: number }>();
  for (const s of sales) for (const i of s.items) {
    const r = map.get(i.productId) ?? { productId: i.productId, name: i.productName, units: 0, revenue: 0, profit: 0 };
    const share = s.subtotal ? (i.quantity * i.unitPrice) / s.subtotal : 0;
    const rev = i.quantity * i.unitPrice - s.discount * share;
    r.units += i.quantity; r.revenue += rev; r.profit += rev - i.quantity * i.unitCost;
    map.set(i.productId, r);
  }
  for (const p of data.products) if (!map.has(p.id)) map.set(p.id, { productId: p.id, name: p.name, units: 0, revenue: 0, profit: 0 });
  return [...map.values()].sort((a, b) => b.units - a.units);
}

export function byCategory(data: ShopData, sales: Sale[]) {
  const map = new Map<string, number>();
  for (const s of sales) for (const i of s.items) map.set(i.categoryId, (map.get(i.categoryId) ?? 0) + i.quantity * i.unitPrice);
  return [...map.entries()]
    .map(([id, value]) => ({ name: data.categories.find((c) => c.id === id)?.name ?? "Uncategorised", value }))
    .sort((a, b) => b.value - a.value);
}

export function expensesIn(data: ShopData, from: Date, to: Date) {
  const a = from.getTime(), b = to.getTime();
  return data.expenses.filter((e) => { const t = new Date(e.date).getTime(); return t >= a && t < b; }).reduce((s, e) => s + e.amount, 0);
}
