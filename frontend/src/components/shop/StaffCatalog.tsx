import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useData } from "@/lib/store";
import { naira } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./bits";

export function StaffCatalog() {
  const data = useData();
  const [query, setQuery] = useState("");
  const products = data.products.filter(p => !p.archived && [p.name,p.sku,p.brand,p.barcode ?? ""].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <><PageHeader title="Products" subtitle="Selling prices and available stock" actions={<Button asChild><Link to="/sell">Record sale</Link></Button>} />
    <Input aria-label="Search products" placeholder="Search products" value={query} onChange={e=>setQuery(e.target.value)} />
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map(p=><div key={p.id} className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{p.name}</h2><p className="text-sm text-muted-foreground">{p.brand} · {p.sku}</p>{p.variants.map(v=><div key={v.id} className="mt-3 flex justify-between gap-2 text-sm"><span>{v.label}</span><span>{naira(v.sellingPrice)} · {v.quantity} in stock</span></div>)}</div>)}</div>
    {!products.length && <p className="mt-6 text-muted-foreground">No products found.</p>}</>;
}
