import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { AlertTriangle, Boxes, CalendarRange, Coins, Package, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, ProductThumb, StatCard } from "@/components/shop/bits";
import { RangeFilter } from "@/components/shop/RangeFilter";
import { CategoryPie, RevenueArea, RevenueBars, TopProductsBar } from "@/components/shop/Charts";
import { useCurrentUser, useData } from "@/lib/store";
import { byCategory, expensesIn, inRange, monthlyTrend, productPerformance, rangeFor, summarize, weekByDay, weeklyTrend, type RangeKey } from "@/lib/analytics";
import { isLowStock, productQty, productValue } from "@/lib/inventory";
import { naira, num, startOfMonth, startOfWeek, addDays } from "@/lib/format";

export const Route = createFileRoute("/_shop/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — StockWise" }, { name: "description", content: "Today's revenue, profit and stock at a glance." }] }),
  component: () => <RequirePerm perm="viewReports"><Dashboard /></RequirePerm>,
});

const LABEL: Record<RangeKey, string> = { today: "Today's", yesterday: "Yesterday's", week: "This week's", lastweek: "Last week's", month: "This month's", lastmonth: "Last month's", custom: "Selected" };

function Dashboard() {
  const data = useData();
  const user = useCurrentUser();
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const s = useMemo(() => {
    const now = new Date();
    const [f, t] = rangeFor(range, custom);
    const sel = inRange(data.sales, f, t);
    return {
      sel: summarize(sel),
      exp: expensesIn(data, f, t),
      week: summarize(inRange(data.sales, startOfWeek(now), addDays(startOfWeek(now), 7))),
      month: summarize(inRange(data.sales, startOfMonth(now), new Date(now.getFullYear(), now.getMonth() + 1, 1))),
      days: weekByDay(data.sales, now),
      weeks: weeklyTrend(data.sales, 8),
      months: monthlyTrend(data.sales, 6),
      top: productPerformance(data, sel).filter((p) => p.units > 0).slice(0, 6),
      cats: byCategory(data, sel),
    };
  }, [data, range, custom]);
  const stockUnits = data.products.reduce((a, p) => a + productQty(p), 0);
  const value = data.products.reduce((a, p) => a + productValue(p), 0);
  const low = data.products.filter(isLowStock);
  const L = LABEL[range];

  return (
    <>
      <PageHeader title={`Good day, ${user?.name.split(" ")[0] ?? ""}`} subtitle={data.shop?.name}
        actions={<RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`${L} revenue`} value={naira(s.sel.revenue)} hint={`Cost of goods ${naira(s.sel.cogs)}`} icon={Wallet} />
        <StatCard label={`${L} gross profit`} value={naira(s.sel.profit)} hint={s.exp ? `Est. net operating profit ${naira(s.sel.profit - s.exp)}` : "Revenue − cost of goods"} icon={TrendingUp} />
        <StatCard label={`${L} items sold`} value={num(s.sel.units)} hint={`${s.sel.transactions} transactions`} icon={ShoppingBag} tone="navy" />
        <StatCard label="Low stock products" value={num(low.length)} hint="At or below threshold" icon={AlertTriangle} tone="warning" />
        <StatCard label="Units in stock" value={num(stockUnits)} hint={`${data.products.length} products`} icon={Boxes} tone="navy" />
        <StatCard label="Inventory value (cost)" value={naira(value)} icon={Coins} tone="navy" />
        <StatCard label="This week's revenue" value={naira(s.week.revenue)} hint={`Profit ${naira(s.week.profit)}`} icon={CalendarRange} />
        <StatCard label="This month's revenue" value={naira(s.month.revenue)} hint={`${s.month.transactions} transactions`} icon={Receipt} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="This week — Monday to Sunday" className="lg:col-span-2" action={<Button asChild variant="ghost" size="sm"><Link to="/daily-sales">Details</Link></Button>}>
          <RevenueBars data={s.days} x="short" />
        </Panel>
        <Panel title="Low stock" action={<Button asChild variant="ghost" size="sm"><Link to="/notifications">View all</Link></Button>}>
          {low.length === 0 ? <EmptyState icon={Package} title="All stocked up" /> : (
            <ul className="space-y-3">
              {low.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link to="/product/$id" params={{ id: p.id }} className="flex items-center gap-3 rounded-lg hover:bg-muted">
                    <ProductThumb product={p} />
                    <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className="text-sm font-semibold text-warning">{productQty(p)} left</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Weekly revenue trend" className="lg:col-span-2"><RevenueArea data={s.weeks} x="label" /></Panel>
        <Panel title="Sales by category">{s.cats.length ? <CategoryPie data={s.cats} /> : <EmptyState title="No sales in this period" />}</Panel>
        <Panel title="Monthly performance" className="lg:col-span-2"><RevenueBars data={s.months} x="label" /></Panel>
        <Panel title="Top-selling products">{s.top.length ? <TopProductsBar data={s.top} /> : <EmptyState title="No sales in this period" />}</Panel>
      </div>
    </>
  );
}
