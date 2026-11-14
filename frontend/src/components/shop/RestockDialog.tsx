import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./Field";
import { actions } from "@/lib/store";
import type { Product } from "@/lib/types";

export function RestockDialog({ product, open, onOpenChange }: { product: Product | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [variantId, setVariantId] = useState("");
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open && product) { setVariantId(product.variants[0]?.id ?? ""); setQty(""); setReason(""); setMode("add"); }
  }, [open, product]);
  if (!product) return null;
  const v = product.variants.find((x) => x.id === variantId);
  const n = parseInt(qty, 10);
  const change = mode === "add" ? n : -n;
  const valid = v && Number.isInteger(n) && n > 0 && v.quantity + change >= 0;
  const submit = () => {
    try {
      actions.adjustStock(product.id, variantId, change, reason.trim() || (mode === "add" ? "Restock" : "Manual removal"));
      toast.success(`${product.name} (${v!.label}): ${v!.quantity} → ${v!.quantity + change}`);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock — {product.name}</DialogTitle>
          <DialogDescription>Restocks and removals are saved to Inventory History.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Variation">
            <Select value={variantId} onValueChange={setVariantId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {product.variants.map((x) => <SelectItem key={x.id} value={x.id}>{x.label} — {x.quantity} in stock</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={mode} onValueChange={(m) => setMode(m as "add" | "remove")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="add">Add stock</SelectItem><SelectItem value="remove">Remove stock</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Quantity" error={v && n > 0 && v.quantity + change < 0 ? `Only ${v.quantity} available` : undefined}>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="20" />
            </Field>
          </div>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "add" ? "New delivery from supplier" : "Damaged item"} /></Field>
          {v && valid && (
            <p className="rounded-lg bg-muted p-3 text-sm">Current <b>{v.quantity}</b> {mode === "add" ? "+" : "−"} {n} = <b>{v.quantity + change}</b></p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Save adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
