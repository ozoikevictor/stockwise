import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/shop/bits";
import { RangeFilter } from "@/components/shop/RangeFilter";
import { useData } from "@/lib/store";
import * as XLSX from "xlsx";
import { FileSpreadsheet, FileDown } from "lucide-react";
import { byCategory, expensesIn, inRange, productPerformance, rangeFor, summarize, type RangeKey } from "@/lib/analytics";
import { isLowStock, productQty } from "@/lib/inventory";
import { addDays, dayKey, downloadFile, fmtDate, naira, num, startOfWeek, toCSV } from "@/lib/format";

export const Route = createFileRoute("/_shop/reports")({
  head: () => ({ meta: [{ title: "Reports — StockWise" }, { name: "description", content: "Daily, weekly and monthly reports with CSV export." }] }),
  component: () => <RequirePerm perm="viewReports"><Reports /></RequirePerm>,
});

function Reports() {
  const data = useData();
  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const r = useMemo(() => {
    const [f, t] = rangeFor(range, custom);
    const sel = inRange(data.sales, f, t);
    const daily: { date: string; revenue: number; profit: number; tx: number; units: number }[] = [];
    for (let d = new Date(f); d < t && d <= new Date(); d = addDays(d, 1)) {
      const s = summarize(inRange(sel, d, addDays(d, 1)));
      daily.push({ date: d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" }), revenue: s.revenue, profit: s.profit, tx: s.transactions, units: s.units });
    }
    const weekly = new Map<string, { label: string; revenue: number; profit: number; tx: number }>();
    for (const s of sel) {
      const k = dayKey(startOfWeek(new Date(s.createdAt)));
      const w = weekly.get(k) ?? { label: `Week of ${fmtDate(startOfWeek(new Date(s.createdAt)))}`, revenue: 0, profit: 0, tx: 0 };
      w.revenue += s.total; w.profit += s.total - s.cogs; w.tx++;
      weekly.set(k, w);
    }
    const monthly = new Map<string, { label: string; revenue: number; profit: number; tx: number }>();
    for (const s of sel) {
      const d = new Date(s.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const m = monthly.get(k) ?? { label: d.toLocaleDateString("en-NG", { month: "long", year: "numeric" }), revenue: 0, profit: 0, tx: 0 };
      m.revenue += s.total; m.profit += s.total - s.cogs; m.tx++;
      monthly.set(k, m);
    }
    const perf = productPerformance(data, sel);
    const yearly = new Map<number, { label: string; revenue: number; profit: number; tx: number }>();
    for (const s of sel) {
      const y = new Date(s.createdAt).getFullYear();
      const m = yearly.get(y) ?? { label: String(y), revenue: 0, profit: 0, tx: 0 };
      m.revenue += s.total; m.profit += s.total - s.cogs; m.tx++; yearly.set(y, m);
    }
    const exps = data.expenses.filter((e) => { const x = new Date(e.date).getTime(); return x >= f.getTime() && x < t.getTime(); });
    return { exp: expensesIn(data, f, t), exps, yearly: [...yearly.values()].reverse(), cats: byCategory(data, sel), f, t, sum: summarize(sel), daily: daily.reverse(), weekly: [...weekly.values()].reverse(), monthly: [...monthly.values()].reverse(),
      best: perf.filter((p) => p.units > 0).slice(0, 10), slow: [...perf].sort((a, b) => a.units - b.units).slice(0, 10) };
  }, [data, range, custom]);
  const low = data.products.filter(isLowStock);
  const period = `${fmtDate(r.f)} – ${fmtDate(addDays(r.t, -1))}`;

  const rows = (): (string | number)[][] => [
    ["StockWise report", data.shop?.name ?? "", period], [],
    ["Generated", new Date().toLocaleString("en-NG")],
    ["Revenue", r.sum.revenue], ["Cost of goods sold", r.sum.cogs], ["Gross profit", r.sum.profit],
    ["Gross margin %", r.sum.revenue ? Math.round((r.sum.profit / r.sum.revenue) * 100) : 0], ["Expenses", r.exp], ["Estimated net operating profit", r.sum.profit - r.exp], ["Transactions", r.sum.transactions], ["Units sold", r.sum.units], [],
    ["Daily", "Revenue", "Gross profit", "Transactions", "Units"], ...r.daily.map((d) => [d.date, d.revenue, d.profit, d.tx, d.units]), [],
    ["Weekly", "Revenue", "Gross profit", "Transactions"], ...r.weekly.map((w) => [w.label, w.revenue, w.profit, w.tx]), [],
    ["Monthly", "Revenue", "Gross profit", "Transactions"], ...r.monthly.map((w) => [w.label, w.revenue, w.profit, w.tx]), [],
    ["Best-selling products", "Units", "Revenue", "Gross profit"], ...r.best.map((p) => [p.name, p.units, Math.round(p.revenue), Math.round(p.profit)]), [],
    ["Slow-moving products", "Units"], ...r.slow.map((p) => [p.name, p.units]), [],
    ["Low-stock products", "In stock", "Threshold"], ...low.map((p) => [p.name, productQty(p), p.lowStockThreshold]), [],
    ["Yearly", "Revenue", "Gross profit", "Transactions"], ...r.yearly.map((w) => [w.label, w.revenue, w.profit, w.tx]), [],
    ["Category", "Revenue"], ...r.cats.map((c) => [c.name, c.value]), [],
    ["Expense date", "Category", "Amount", "Note"], ...r.exps.map((e) => [fmtDate(e.date), e.category, e.amount, e.note]),
  ];
  const csv = () => downloadFile(`stockwise-report-${dayKey(r.f)}.csv`, toCSV(rows()));
  const xlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows()), "Report");
    XLSX.writeFile(wb, `stockwise-report-${dayKey(r.f)}.xlsx`);
  };
  const pdf = async () => {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    const N = (n: number) => "NGN " + Math.round(n).toLocaleString("en-NG");
    doc.setFontSize(16); doc.text(`${data.shop?.name ?? "StockWise"} — Sales report`, 14, 16);
    doc.setFontSize(10); doc.text(`${period}  ·  Generated ${new Date().toLocaleString("en-NG")}`, 14, 23);
    const sec = (title: string, head: string[], body: (string | number)[][]) => {
      const y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 26) + 8;
      doc.setFontSize(12); doc.text(title, 14, y);
      autoTable(doc, { startY: y + 2, head: [head], body: body.length ? body : [["No data"]], headStyles: { fillColor: [22, 140, 90] }, styles: { fontSize: 9 } });
    };
    sec("Summary", ["Measure", "Value"], [["Revenue", N(r.sum.revenue)], ["Cost of goods sold", N(r.sum.cogs)], ["Gross profit", N(r.sum.profit)], ["Expenses", N(r.exp)], ["Est. net operating profit", N(r.sum.profit - r.exp)], ["Transactions", r.sum.transactions], ["Units sold", r.sum.units]]);
    sec("Daily", ["Date", "Revenue", "Gross profit", "Sales"], r.daily.map((d) => [d.date, N(d.revenue), N(d.profit), d.tx]));
    sec("Weekly", ["Week", "Revenue", "Gross profit", "Sales"], r.weekly.map((w) => [w.label, N(w.revenue), N(w.profit), w.tx]));
    sec("Monthly", ["Month", "Revenue", "Gross profit", "Sales"], r.monthly.map((w) => [w.label, N(w.revenue), N(w.profit), w.tx]));
    sec("Best-selling products", ["Product", "Units", "Revenue"], r.best.map((p) => [p.name, p.units, N(p.revenue)]));
    sec("Category performance", ["Category", "Revenue"], r.cats.map((c) => [c.name, N(c.value)]));
    sec("Low stock", ["Product", "In stock", "Threshold"], low.map((p) => [p.name, productQty(p), p.lowStockThreshold]));
    sec("Expenses", ["Date", "Category", "Amount", "Note"], r.exps.map((e) => [fmtDate(e.date), e.category, N(e.amount), e.note]));
    doc.save(`stockwise-report-${dayKey(r.f)}.pdf`);
  };

  const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
    rows.length === 0 ? <p className="text-sm text-muted-foreground">No data for this period.</p> : (
      <div className="max-h-80 overflow-auto print:max-h-none">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground"><tr>{head.map((h, i) => <th key={h} className={i ? "pb-2 text-right" : "pb-2"}>{h}</th>)}</tr></thead>
          <tbody className="divide-y">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "py-1.5 text-right" : "py-1.5"}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    ));

  return (
    <>
      <PageHeader title="Reports" subtitle={`${data.shop?.name} · ${period}`}
        actions={<>
          <RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} />
          <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
          <Button variant="outline" onClick={csv}><Download /> CSV</Button>
          <Button variant="outline" onClick={xlsx}><FileSpreadsheet /> Excel</Button>
          <Button onClick={() => void pdf()}><FileDown /> PDF</Button>
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[["Revenue", naira(r.sum.revenue)], ["Cost of goods", naira(r.sum.cogs)], ["Gross profit", naira(r.sum.profit)], ["Transactions", num(r.sum.transactions)], ["Units sold", num(r.sum.units)], ["Expenses", naira(r.exp)], ["Est. net operating profit", naira(r.sum.profit - r.exp)], ["Gross margin", `${r.sum.revenue ? Math.round((r.sum.profit / r.sum.revenue) * 100) : 0}%`]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-4 shadow-card"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-lg font-bold">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-1">
        <Panel title="Daily revenue"><Table head={["Date", "Revenue", "Profit", "Sales"]} rows={r.daily.map((d) => [d.date, naira(d.revenue), naira(d.profit), d.tx])} /></Panel>
        <div className="space-y-6">
          <Panel title="Weekly revenue"><Table head={["Week", "Revenue", "Profit", "Sales"]} rows={r.weekly.map((w) => [w.label, naira(w.revenue), naira(w.profit), w.tx])} /></Panel>
          <Panel title="Monthly revenue"><Table head={["Month", "Revenue", "Profit", "Sales"]} rows={r.monthly.map((w) => [w.label, naira(w.revenue), naira(w.profit), w.tx])} /></Panel>
        </div>
        <Panel title="Best-selling products"><Table head={["Product", "Units", "Revenue"]} rows={r.best.map((p) => [p.name, p.units, naira(p.revenue)])} /></Panel>
        <Panel title="Slow-moving products"><Table head={["Product", "Units sold", "In stock"]} rows={r.slow.map((p) => [p.name, p.units, productQty(data.products.find((x) => x.id === p.productId) ?? { variants: [] } as never)])} /></Panel>
        <Panel title="Yearly revenue"><Table head={["Year", "Revenue", "Profit", "Sales"]} rows={r.yearly.map((w) => [w.label, naira(w.revenue), naira(w.profit), w.tx])} /></Panel>
        <Panel title="Category performance"><Table head={["Category", "Revenue"]} rows={r.cats.map((c) => [c.name, naira(c.value)])} /></Panel>
        <Panel title="Expenses" className="lg:col-span-2"><Table head={["Date", "Category", "Amount", "Note"]} rows={r.exps.map((e) => [fmtDate(e.date), e.category, naira(e.amount), e.note])} /></Panel>
        <Panel title="Low-stock products" className="lg:col-span-2"><Table head={["Product", "In stock", "Threshold"]} rows={low.map((p) => [p.name, productQty(p), p.lowStockThreshold])} /></Panel>
      </div>
    </>
  );
}
