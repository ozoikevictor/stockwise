import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, ProductThumb, StockBadge } from "@/components/shop/bits";
import { RestockDialog } from "@/components/shop/RestockDialog";
import { useData } from "@/lib/store";
import { completed } from "@/lib/analytics";
import { productQty, productValue } from "@/lib/inventory";
import { fmtDate, fmtDateTime, naira, num } from "@/lib/format";

export const Route = createFileRoute("/_shop/product/$id")({
  head: () => ({ meta: [{ title: "Product details — StockWise" }, { name: "description", content: "Stock, variations and sales for this product." }] }),
  component: () => <RequirePerm perm="manageProducts"><ProductDetail /></RequirePerm>,
});

function ProductDetail() {
  const { id } = Route.useParams();
  const data = useData();
  const p = data.products.find((x) => x.id === id);
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => {
    let units = 0, revenue = 0;
    for (const s of completed(data.sales)) for (const i of s.items) if (i.productId === id) { units += i.quantity; revenue += i.quantity * i.unitPrice; }
    return { units, revenue };
  }, [data.sales, id]);
  if (!p) return <EmptyState title="Product not found" action={<Button asChild><Link to="/products">Back to products</Link></Button>} />;
  const adj = data.adjustments.filter((a) => a.productId === id).slice(0, 10);
  return (
    <>
      <PageHeader title={p.name} subtitle={`${p.brand} · ${data.categories.find((c) => c.id === p.categoryId)?.name ?? ""} · ${p.sku}`}
        actions={<>
          <Button variant="outline" asChild><Link to="/edit-product/$id" params={{ id }}><Pencil /> Edit</Link></Button>
          <Button onClick={() => setOpen(true)}><PlusCircle /> Restock</Button>
        </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <ProductThumb product={p} className="aspect-square size-auto w-full rounded-xl text-5xl" />
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StockBadge product={p} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">In stock</span><b>{num(productQty(p))}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Low stock at</span><span>{p.lowStockThreshold}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Stock value (cost)</span><span>{naira(productValue(p))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Units sold (all time)</span><span>{num(stats.units)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue (all time)</span><span>{naira(stats.revenue)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Model / barcode</span><span>{p.model || "—"} · {p.barcode || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Last updated</span><span>{fmtDate(p.updatedAt ?? p.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span>{p.supplier || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Added</span><span>{fmtDate(p.createdAt)}</span></div>
          </div>
          {p.description && <p className="mt-4 text-sm text-muted-foreground">{p.description}</p>}
        </Panel>
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Variations">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Variation</th><th className="pb-2">SKU</th><th className="pb-2 text-right">Cost</th><th className="pb-2 text-right">Price</th><th className="pb-2 text-right">Margin</th><th className="pb-2 text-right">Stock</th></tr></thead>
                <tbody className="divide-y">
                  {p.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2 font-medium">{v.label}</td><td className="py-2 text-muted-foreground">{v.sku}</td>
                      <td className="py-2 text-right">{naira(v.costPrice)}</td><td className="py-2 text-right">{naira(v.sellingPrice)}</td>
                      <td className="py-2 text-right text-primary">{naira(v.sellingPrice - v.costPrice)}</td>
                      <td className="py-2 text-right font-semibold">{v.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Recent stock adjustments" action={<Button asChild variant="ghost" size="sm"><Link to="/inventory-history">All history</Link></Button>}>
            {adj.length === 0 ? <p className="text-sm text-muted-foreground">No adjustments yet.</p> : (
              <ul className="divide-y text-sm">
                {adj.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2">
                    <span><span className="font-medium">{a.variantLabel}</span> · {a.reason}<br /><span className="text-xs text-muted-foreground">{fmtDateTime(a.at)}</span></span>
                    <span className="text-right">{a.previous} → <b>{a.next}</b><br /><span className={a.change > 0 ? "text-primary" : "text-destructive"}>{a.change > 0 ? "+" : ""}{a.change}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      <RestockDialog product={p} open={open} onOpenChange={setOpen} />
    </>
  );
}

