import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Download, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shop/bits";
import { SaleDetailDialog } from "@/components/shop/SaleDialogs";
import { useActor, useCan, useData } from "@/lib/store";
import * as XLSX from "xlsx";
import { addDays, downloadFile, fmtDate, fmtDateTime, naira, startOfDay, toCSV } from "@/lib/format";

export const Route = createFileRoute("/_shop/sales")({
  head: () => ({ meta: [{ title: "Sales history — StockWise" }, { name: "description", content: "Search and review every transaction." }] }),
  component: () => <RequirePerm perm="sell"><SalesHistory /></RequirePerm>,
});

function SalesHistory() {
  const data = useData();
  const [q, setQ] = useState("");
  const [pay, setPay] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<DateRange | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const actor = useActor();
  const all = useCan("viewAllSales");
  const list = useMemo(() => data.sales.filter((s) => all || s.cashierId === actor?.id).filter((s) => {
    const t = q.toLowerCase();
    const m = !t || s.number.toLowerCase().includes(t) || s.customerName.toLowerCase().includes(t) || s.items.some((i) => i.productName.toLowerCase().includes(t) || i.sku.toLowerCase().includes(t));
    const at = new Date(s.createdAt).getTime();
    const inR = !range?.from || (at >= startOfDay(range.from).getTime() && at < addDays(startOfDay(range.to ?? range.from), 1).getTime());
    return m && inR && (pay === "all" || s.payment === pay) && (status === "all" || s.status === status);
  }), [data.sales, q, pay, status, range, all, actor]);

  const rows = () => { const values = [
    ["Transaction", "Date & time", "Items", "Units", "Subtotal", "Discount", "Total", "Cost of goods", "Gross profit", "Payment", "Status", "Customer", "Cashier"],
    ...list.map((s) => [s.number, fmtDateTime(s.createdAt), s.items.map((i) => `${i.quantity}x ${i.productName} (${i.variantLabel})`).join("; "),
      s.items.reduce((a, i) => a + i.quantity, 0), s.subtotal, s.discount, s.total, s.cogs, s.total - s.cogs, s.payment, s.status, s.customerName, s.cashierName ?? ""]),
  ]; return all ? values : values.map(row => row.filter((_, index) => index !== 7 && index !== 8)); };
  const exportCsv = () => downloadFile(`sales-${fmtDate(new Date())}.csv`, toCSV(rows()));
  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows()), "Sales");
    XLSX.writeFile(wb, `sales-${fmtDate(new Date())}.xlsx`);
  };

  return (
    <>
      <PageHeader title="Sales history" subtitle={`${list.length} of ${data.sales.length} transactions`}
        actions={<><Button variant="outline" onClick={exportCsv} disabled={!list.length}><Download /> CSV</Button><Button variant="outline" onClick={exportXlsx} disabled={!list.length}><Download /> Excel</Button></>} />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search transaction, product or customer" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline"><CalendarIcon />{range?.from ? `${fmtDate(range.from)}${range.to ? " – " + fmtDate(range.to) : ""}` : "Any date"}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar mode="range" selected={range} onSelect={setRange} />
            {range && <div className="border-t p-2"><Button variant="ghost" size="sm" className="w-full" onClick={() => setRange(undefined)}>Clear dates</Button></div>}
          </PopoverContent>
        </Popover>
        <Select value={pay} onValueChange={setPay}>
          <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All payments</SelectItem>{["Cash", "Transfer", "POS", "Other"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="refunded">Refunded</SelectItem></SelectContent>
        </Select>
      </div>
      {list.length === 0 ? <EmptyState icon={Receipt} title="No transactions found" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Transaction</th><th className="p-3">Date & time</th><th className="p-3">Products</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Total</th><th className="p-3">Payment</th><th className="p-3">Cashier</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y">
              {list.slice(0, 300).map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(s.id)}>
                  <td className="p-3 font-medium">{s.number}</td>
                  <td className="p-3 text-muted-foreground">{fmtDateTime(s.createdAt)}</td>
                  <td className="max-w-xs truncate p-3">{s.items.map((i) => i.productName).join(", ")}</td>
                  <td className="p-3 text-right">{s.items.reduce((a, i) => a + i.quantity, 0)}</td>
                  <td className="p-3 text-right font-semibold">{naira(s.total)}</td>
                  <td className="p-3">{s.payment}</td>
                  <td className="p-3">{s.cashierName ?? "—"}</td>
                  <td className="p-3"><StatusBadge status={s.status} /></td>
                  <td className="p-3"><Button variant="ghost" size="sm">Receipt</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SaleDetailDialog saleId={open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}

