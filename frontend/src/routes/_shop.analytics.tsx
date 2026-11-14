import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Coins, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shop/bits";
import { RangeFilter } from "@/components/shop/RangeFilter";
import { CategoryPie, RevenueArea, RevenueBars, TopProductsBar } from "@/components/shop/Charts";
import { useData } from "@/lib/store";
import { byCategory, expensesIn, inRange, monthlyTrend, productPerformance, rangeFor, summarize, weekByDay, weeklyTrend, type RangeKey } from "@/lib/analytics";
import { naira, num } from "@/lib/format";

export const Route = createFileRoute("/_shop/analytics")({
  head: () => ({ meta: [{ title: "Analytics — StockWise" }, { name: "description", content: "Charts for revenue, profit and best sellers." }] }),
  component: () => <RequirePerm perm="viewReports"><Analytics /></RequirePerm>,
});

function Analytics() {
  const data = useData();
  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const a = useMemo(() => {
    const [f, t] = rangeFor(range, custom);
    const sel = inRange(data.sales, f, t);
    return { exp: expensesIn(data, f, t), s: summarize(sel), top: productPerformance(data, sel).filter((p) => p.units).slice(0, 8), cats: byCategory(data, sel),
      days: weekByDay(data.sales, new Date()), weeks: weeklyTrend(data.sales, 12), months: monthlyTrend(data.sales, 12) };
  }, [data, range, custom]);
  const margin = a.s.revenue ? Math.round((a.s.profit / a.s.revenue) * 100) : 0;
  return (
    <>
      <PageHeader title="Analytics" subtitle="Calculated from your recorded transactions." actions={<RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={naira(a.s.revenue)} icon={Wallet} />
        <StatCard label="Cost of goods sold" value={naira(a.s.cogs)} icon={Coins} tone="navy" />
        <StatCard label="Gross profit" value={naira(a.s.profit)} hint={`${margin}% gross margin`} icon={TrendingUp} />
        <StatCard label="Units sold" value={num(a.s.units)} hint={`${a.s.transactions} transactions`} icon={ShoppingBag} tone="navy" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="This week, Monday to Sunday"><RevenueBars data={a.days} x="short" /></Panel>
        <Panel title="Weekly revenue (12 weeks)"><RevenueArea data={a.weeks} x="label" /></Panel>
        <Panel title="Monthly sales (12 months)"><RevenueBars data={a.months} x="label" /></Panel>
        <Panel title="Sales by category">{a.cats.length ? <CategoryPie data={a.cats} /> : <EmptyState title="No sales in this period" />}</Panel>
        <Panel title="Top-selling products" className="lg:col-span-2">{a.top.length ? <TopProductsBar data={a.top} /> : <EmptyState title="No sales in this period" />}</Panel>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard label="Expenses" value={naira(a.exp)} icon={Coins} tone="warning" />
        <StatCard label="Estimated net operating profit" value={naira(a.s.profit - a.exp)} hint="Gross profit − expenses" icon={Wallet} tone="navy" />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Gross profit = revenue − cost of goods sold. Net operating profit also subtracts the expenses you record on the Expenses page.</p>
    </>
  );
}
