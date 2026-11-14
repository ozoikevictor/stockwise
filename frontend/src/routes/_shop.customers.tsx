import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/shop/bits";
import { RequirePerm } from "@/components/shop/RequirePerm";
import { useData } from "@/lib/store";
import { completed } from "@/lib/analytics";
import { fmtDate, naira } from "@/lib/format";

export const Route = createFileRoute("/_shop/customers")({
  head: () => ({ meta: [{ title: "Customers — StockWise" }, { name: "description", content: "Customers who gave their name or phone at checkout." }] }),
  component: () => <RequirePerm perm="viewAllSales"><Customers /></RequirePerm>,
});

function Customers() {
  const data = useData();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; visits: number; spent: number; last: string }>();
    for (const s of completed(data.sales)) {
      if (!s.customerName && !s.customerPhone) continue;
      const k = (s.customerPhone || s.customerName).toLowerCase();
      const c = m.get(k) ?? { name: s.customerName, phone: s.customerPhone, visits: 0, spent: 0, last: s.createdAt };
      c.visits++; c.spent += s.total; if (s.createdAt > c.last) c.last = s.createdAt;
      if (!c.name) c.name = s.customerName;
      m.set(k, c);
    }
    return [...m.values()].filter((c) => !q || (c.name + c.phone).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.spent - a.spent);
  }, [data.sales, q]);
  return (
    <>
      <PageHeader title="Customers" subtitle="Built from customer details entered when recording sales." />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <EmptyState icon={Users} title="No customers yet" text="Add a customer name or phone on the Record Sale page and they'll appear here." /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3 text-right">Purchases</th><th className="p-3 text-right">Total spent</th><th className="p-3">Last visit</th></tr>
            </thead>
            <tbody className="divide-y">
              {list.map((c) => (
                <tr key={c.phone + c.name}><td className="p-3 font-medium">{c.name || "—"}</td><td className="p-3">{c.phone || "—"}</td>
                  <td className="p-3 text-right">{c.visits}</td><td className="p-3 text-right font-semibold">{naira(c.spent)}</td><td className="p-3">{fmtDate(c.last)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
