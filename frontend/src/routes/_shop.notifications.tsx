import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BellOff, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, ProductThumb } from "@/components/shop/bits";
import { RestockDialog } from "@/components/shop/RestockDialog";
import { useData } from "@/lib/store";
import { isLowStock, productQty } from "@/lib/inventory";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shop/notifications")({
  head: () => ({ meta: [{ title: "Notifications — StockWise" }, { name: "description", content: "Low stock and out-of-stock alerts." }] }),
  component: () => <RequirePerm perm="viewProducts"><Notifications /></RequirePerm>,
});

function Notifications() {
  const data = useData();
  const [restock, setRestock] = useState<Product | null>(null);
  const low = data.products.filter(isLowStock).sort((a, b) => productQty(a) - productQty(b));
  return (
    <>
      <PageHeader title="Notifications" subtitle="Products at or below their low-stock threshold." />
      {low.length === 0 ? <EmptyState icon={BellOff} title="No alerts" text="Every product is above its low-stock threshold." /> : (
        <ul className="space-y-3">
          {low.map((p) => {
            const q = productQty(p);
            return (
              <li key={p.id} className={cn("flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4 shadow-card", q === 0 ? "border-destructive/40" : "border-warning/40")}>
                <ProductThumb product={p} />
                <div className="min-w-0 flex-1">
                  <Link to="/product/$id" params={{ id: p.id }} className="font-medium hover:text-primary">{p.name}</Link>
                  <p className={cn("text-sm font-semibold", q === 0 ? "text-destructive" : "text-warning")}>{q === 0 ? "Out of stock" : `${q} unit${q === 1 ? "" : "s"} remaining`}</p>
                  <p className="text-xs text-muted-foreground">Threshold {p.lowStockThreshold} · {p.variants.map((v) => `${v.label}: ${v.quantity}`).join(" · ")}</p>
                </div>
                <Button onClick={() => setRestock(p)}><PlusCircle /> Restock</Button>
              </li>
            );
          })}
        </ul>
      )}
      <RestockDialog product={restock} open={!!restock} onOpenChange={(o) => !o && setRestock(null)} />
    </>
  );
}
