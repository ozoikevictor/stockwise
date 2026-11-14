import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState, PageHeader, Panel, StatusBadge } from "@/components/shop/bits";
import { RevenueBars } from "@/components/shop/Charts";
import { SaleDetailDialog } from "@/components/shop/SaleDialogs";
import { useData } from "@/lib/store";
import { summarize, weekByDay } from "@/lib/analytics";
import { addDays, dayKey, fmtDate, naira, startOfWeek } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shop/daily-sales")({
  head: () => ({ meta: [{ title: "Daily sales — StockWise" }, { name: "description", content: "Monday to Sunday sales, week by week." }] }),
  component: () => <RequirePerm perm="viewReports"><DailySales /></RequirePerm>,
});

function DailySales() {
  const data = useData();
  const [ref, setRef] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [open, setOpen] = useState<string | null>(null);
  const days = useMemo(() => weekByDay(data.sales, ref), [data.sales, ref]);
  const week = days.reduce((a, d) => ({ revenue: a.revenue + d.revenue, profit: a.profit + d.profit, units: a.units + d.units, tx: a.tx + d.transactions }), { revenue: 0, profit: 0, units: 0, tx: 0 });
  const ws = startOfWeek(ref);
  const isCurrent = dayKey(ws) === dayKey(startOfWeek(new Date()));
  const dayTx = data.sales.filter((s) => dayKey(s.createdAt) === dayKey(selected));
  const daySum = summarize(dayTx.filter((s) => s.status === "completed"));
  const saleDays = useMemo(() => new Set(data.sales.map((s) => dayKey(s.createdAt))), [data.sales]);

  return (
    <>
      <PageHeader title="Daily sales" subtitle="Every day of the week, including Sunday. Past weeks are always kept." />
      <Panel className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setRef(addDays(ref, -7))}><ChevronLeft /></Button>
            <p className="font-semibold">{fmtDate(ws)} – {fmtDate(addDays(ws, 6))}</p>
            <Button variant="outline" size="icon" aria-label="Next week" disabled={isCurrent} onClick={() => setRef(addDays(ref, 7))}><ChevronRight /></Button>
            {!isCurrent && <Button variant="ghost" size="sm" onClick={() => setRef(new Date())}>This week</Button>}
          </div>
          <p className="text-sm text-muted-foreground">Weekly total <span className="ml-1 font-display text-xl font-bold text-foreground">{naira(week.revenue)}</span></p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {days.map((d) => {
            const sel = d.key === dayKey(selected);
            const today = d.key === dayKey(new Date());
            return (
              <button key={d.key} onClick={() => setSelected(d.date)}
                className={cn("rounded-xl border p-3 text-left transition-colors", sel ? "border-primary bg-primary-soft" : "hover:bg-muted")}>
                <p className="text-xs font-medium text-muted-foreground">{d.day}{today && " · Today"}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(d.date)}</p>
                <p className="mt-2 font-display text-lg font-bold">{naira(d.revenue)}</p>
                <p className="text-xs text-muted-foreground">{d.transactions} sales · {d.units} units</p>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-muted p-3 text-sm">
          <div><p className="text-muted-foreground">Gross profit</p><p className="font-semibold">{naira(week.profit)}</p></div>
          <div><p className="text-muted-foreground">Units sold</p><p className="font-semibold">{week.units}</p></div>
          <div><p className="text-muted-foreground">Transactions</p><p className="font-semibold">{week.tx}</p></div>
        </div>
        <div className="mt-4"><RevenueBars data={days} x="short" /></div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Pick any date">
          <Calendar mode="single" selected={selected} onSelect={(d) => { if (d) { setSelected(d); setRef(d); } }}
            disabled={{ after: new Date() }} weekStartsOn={1}
            modifiers={{ hasSales: (d) => saleDays.has(dayKey(d)) }} modifiersClassNames={{ hasSales: "font-bold text-primary" }} />
        </Panel>
        <Panel title={`Transactions on ${selected.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}`} className="lg:col-span-2">
          <p className="mb-3 text-sm text-muted-foreground">Revenue {naira(daySum.revenue)} · Gross profit {naira(daySum.profit)} · {daySum.units} units</p>
          {dayTx.length === 0 ? <EmptyState title="No sales on this day" text="₦0 recorded." /> : (
            <ul className="divide-y">
              {dayTx.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setOpen(s.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-muted/50">
                    <span>
                      <span className="block text-sm font-medium">{s.number} · {new Date(s.createdAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-xs text-muted-foreground">{s.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}</span>
                    </span>
                    <span className="flex items-center gap-2"><StatusBadge status={s.status} /><b className="text-sm">{naira(s.total)}</b></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <SaleDetailDialog saleId={open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}
