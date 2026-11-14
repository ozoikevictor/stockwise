import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/shop/bits";
import { actions, useData } from "@/lib/store";
import { productQty } from "@/lib/inventory";
import { num } from "@/lib/format";

export const Route = createFileRoute("/_shop/categories")({
  head: () => ({ meta: [{ title: "Categories — StockWise" }, { name: "description", content: "Organise products into categories." }] }),
  component: () => <RequirePerm perm="manageProducts"><Categories /></RequirePerm>,
});

function Categories() {
  const data = useData();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    try { actions.addCategory(name); setName(""); toast.success("Category added"); } catch (er) { toast.error((er as Error).message); }
  };
  return (
    <>
      <PageHeader title="Categories" subtitle="Add as many categories as your shop needs." />
      <form onSubmit={add} className="mb-6 flex max-w-md gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Sunglasses" aria-label="Category name" />
        <Button type="submit" disabled={!name.trim()}><Plus /> Add</Button>
      </form>
      {data.categories.length === 0 ? <EmptyState icon={Tags} title="No categories yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.categories.map((c) => {
            const ps = data.products.filter((p) => p.categoryId === c.id);
            return (
              <div key={c.id} className="rounded-2xl border bg-card p-5 shadow-card">
                {edit?.id === c.id ? (
                  <div className="flex gap-2">
                    <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
                    <Button size="icon" aria-label="Save" onClick={() => { if (edit.name.trim()) { actions.renameCategory(c.id, edit.name); setEdit(null); } }}><Check /></Button>
                    <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEdit(null)}><X /></Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{ps.length} products · {num(ps.reduce((a, p) => a + productQty(p), 0))} units</p>
                    </div>
                    <div className="flex">
                      <Button size="icon" variant="ghost" aria-label="Rename" onClick={() => setEdit({ id: c.id, name: c.name })}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => {
                        try { actions.deleteCategory(c.id); toast.success("Category deleted"); } catch (e) { toast.error((e as Error).message); }
                      }}><Trash2 /></Button>
                    </div>
                  </div>
                )}
                {ps.length > 0 && <Link to="/products" className="mt-3 inline-block text-xs text-primary hover:underline">View products</Link>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
