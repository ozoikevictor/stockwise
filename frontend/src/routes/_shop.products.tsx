import { StaffCatalog } from "@/components/shop/StaffCatalog";
import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, MoreHorizontal, PackagePlus, Pencil, PlusCircle, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, PageHeader, ProductThumb, StatCard, StockBadge } from "@/components/shop/bits";
import { RestockDialog } from "@/components/shop/RestockDialog";
import { actions, useCan, useData } from "@/lib/store";
import * as XLSX from "xlsx";
import { Archive, ArchiveRestore, Download } from "lucide-react";
import { isLowStock, productQty, productValue } from "@/lib/inventory";
import { naira, num } from "@/lib/format";
import type { Product } from "@/lib/types";
import { Coins, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_shop/products")({
  head: () => ({ meta: [{ title: "Products — StockWise" }, { name: "description", content: "Search, filter and restock your inventory." }] }),
  component: () => <RequirePerm perm="viewProducts"><ProductAccess /></RequirePerm>,
});

function Products() {
  const data = useData();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [stock, setStock] = useState("all");
  const [brand, setBrand] = useState("all");
  const canManage = useCan("manageProducts");
  const canStock = useCan("manageStock");
  const brands = [...new Set(data.products.map((p) => p.brand).filter(Boolean))].sort();
  const [restock, setRestock] = useState<Product | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const list = useMemo(() => data.products.filter((p) => {
    const t = q.toLowerCase();
    const m = !t || [p.name, p.brand, p.sku, p.barcode ?? "", p.model ?? "", ...p.variants.map((v) => v.sku + " " + v.label)].some((x) => x.toLowerCase().includes(t));
    const qty = productQty(p);
    if (stock === "archived") return !!p.archived && m;
    if (p.archived) return false;
    if (brand !== "all" && p.brand !== brand) return false;
    const s = stock === "all" || (stock === "low" && isLowStock(p) && qty > 0) || (stock === "out" && qty === 0) || (stock === "in" && !isLowStock(p));
    return m && s && (cat === "all" || p.categoryId === cat);
  }), [data.products, q, cat, stock, brand]);
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "—";
  const active = data.products.filter((p) => !p.archived);
  const totalQty = active.reduce((a, p) => a + productQty(p), 0);
  const totalVal = active.reduce((a, p) => a + productValue(p), 0);

  return (
    <>
      <PageHeader title="Products" subtitle={`${data.products.length} products in ${data.categories.length} categories`}
        actions={<>
          <Button variant="outline" onClick={() => {
            const rows = [["Product", "Brand", "Model", "Category", "Variation", "SKU", "Barcode", "Cost", "Price", "Qty", "Stock value", "Supplier"]];
            for (const p of data.products.filter((x) => !x.archived)) for (const v of p.variants)
              rows.push([p.name, p.brand, p.model ?? "", catName(p.categoryId), v.label, v.sku, p.barcode ?? "", String(v.costPrice), String(v.sellingPrice), String(v.quantity), String(v.costPrice * v.quantity), p.supplier]);
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Inventory");
            XLSX.writeFile(wb, "stockwise-inventory.xlsx");
          }}><Download /> Export inventory</Button>
          {canManage && <Button asChild><Link to="/add-product"><PackagePlus /> Add product</Link></Button>}
        </>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total inventory quantity" value={num(totalQty)} icon={Boxes} tone="navy" />
        <StatCard label="Estimated inventory value (cost)" value={naira(totalVal)} icon={Coins} />
        <StatCard label="Low / out of stock" value={num(data.products.filter(isLowStock).length)} icon={AlertTriangle} tone="warning" />
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, brand or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{data.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All brands</SelectItem>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stock} onValueChange={setStock}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem><SelectItem value="in">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem><SelectItem value="out">Out of stock</SelectItem><SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {list.length === 0 ? (
        <EmptyState title={data.products.length ? "No products match your filters" : "No products yet"} text="Add your first product to start tracking stock."
          action={<Button asChild><Link to="/add-product"><PackagePlus /> Add product</Link></Button>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Product</th><th className="p-3">Category</th><th className="p-3">Price</th><th className="p-3">Variations</th><th className="p-3 text-right">Stock</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y">
              {list.map((p) => {
                const prices = p.variants.map((v) => v.sellingPrice);
                const mn = Math.min(...prices), mx = Math.max(...prices);
                return (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="p-3">
                      <Link to="/product/$id" params={{ id: p.id }} className="flex items-center gap-3">
                        <ProductThumb product={p} />
                        <span><span className="block font-medium hover:text-primary">{p.name}</span><span className="text-xs text-muted-foreground">{p.brand} · {p.sku}</span></span>
                      </Link>
                    </td>
                    <td className="p-3">{catName(p.categoryId)}</td>
                    <td className="p-3">{mn === mx ? naira(mn) : `${naira(mn)} – ${naira(mx)}`}</td>
                    <td className="p-3">{p.variants.length}</td>
                    <td className="p-3 text-right font-semibold">{num(productQty(p))}</td>
                    <td className="p-3"><StockBadge product={p} /></td>
                    <td className="p-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canStock && !p.archived && <DropdownMenuItem onClick={() => setRestock(p)}><PlusCircle /> Restock / adjust</DropdownMenuItem>}
                          {canManage && <DropdownMenuItem asChild><Link to="/edit-product/$id" params={{ id: p.id }}><Pencil /> Edit</Link></DropdownMenuItem>}
                          {canManage && <DropdownMenuItem onClick={() => { actions.setArchived(p.id, !p.archived); toast.success(p.archived ? "Product restored" : "Product archived"); }}>
                            {p.archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}</DropdownMenuItem>}
                          {canManage && <DropdownMenuItem className="text-destructive" onClick={() => setDel(p)}><Trash2 /> Delete</DropdownMenuItem>}
                          {!canManage && !canStock && <DropdownMenuItem asChild><Link to="/product/$id" params={{ id: p.id }}>View</Link></DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <RestockDialog product={restock} open={!!restock} onOpenChange={(o) => !o && setRestock(null)} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {del?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The product is removed from inventory. Past sales that included it stay in your history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (del) { actions.deleteProduct(del.id); toast.success("Product deleted"); } }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


function ProductAccess() { const owner = useCan("viewReports"); return owner ? <Products /> : <StaffCatalog />; }
