import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/shop/bits";
import { useData } from "@/lib/store";
import { downloadFile, fmtDate, fmtDateTime, toCSV } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shop/inventory-history")({
  head: () => ({ meta: [{ title: "Inventory history — StockWise" }, { name: "description", content: "Every restock and manual stock adjustment." }] }),
  component: () => <RequirePerm perm="manageStock"><InventoryHistory /></RequirePerm>,
});

const TYPE: Record<string, string> = { initial: "Opening stock", restock: "Restock", removal: "Removal", "refund-restock": "Refund return" };

function InventoryHistory() {
  const data = useData();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const list = useMemo(() => data.adjustments.filter((a) =>
    (type === "all" || a.type === type) && (!q || (a.productName + a.variantLabel + a.reason).toLowerCase().includes(q.toLowerCase()))), [data.adjustments, q, type]);
  return (
    <>
      <PageHeader title="Inventory history" subtitle="Manual stock changes. Sales deductions are tracked separately in Sales History."
        actions={<Button variant="outline" disabled={!list.length} onClick={() => downloadFile(`inventory-history-${fmtDate(new Date())}.csv`, toCSV([
          ["Date", "Product", "Variation", "Type", "Previous", "Change", "New", "Reason"],
          ...list.map((a) => [fmtDateTime(a.at), a.productName, a.variantLabel, TYPE[a.type] ?? a.type, a.previous, a.change, a.next, a.reason]),
        ]))}><Download /> Export CSV</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search product or reason" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {list.length === 0 ? <EmptyState icon={History} title="No adjustments yet" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Date</th><th className="p-3">Product</th><th className="p-3">Type</th><th className="p-3 text-right">Previous</th><th className="p-3 text-right">Change</th><th className="p-3 text-right">New</th><th className="p-3">Reason</th></tr>
            </thead>
            <tbody className="divide-y">
              {list.slice(0, 400).map((a) => (
                <tr key={a.id}>
                  <td className="p-3 text-muted-foreground">{fmtDateTime(a.at)}</td>
                  <td className="p-3"><span className="font-medium">{a.productName}</span><span className="block text-xs text-muted-foreground">{a.variantLabel}</span></td>
                  <td className="p-3">{TYPE[a.type]}</td>
                  <td className="p-3 text-right">{a.previous}</td>
                  <td className={cn("p-3 text-right font-semibold", a.change > 0 ? "text-primary" : "text-destructive")}>{a.change > 0 ? "+" : ""}{a.change}</td>
                  <td className="p-3 text-right font-semibold">{a.next}</td>
                  <td className="p-3">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
