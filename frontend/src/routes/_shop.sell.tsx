import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, PageHeader, Panel, ProductThumb } from "@/components/shop/bits";
import { Field } from "@/components/shop/Field";
import { SaleDetailDialog } from "@/components/shop/SaleDialogs";
import { actions, useData } from "@/lib/store";
import { naira } from "@/lib/format";
import type { CartLine, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shop/sell")({
  head: () => ({ meta: [{ title: "Record sale — StockWise" }, { name: "description", content: "Point of sale: add items, take payment, print a receipt." }] }),
  component: () => <RequirePerm perm="sell"><Sell /></RequirePerm>,
});

const PAYMENTS: PaymentMethod[] = ["Cash", "Transfer", "POS", "Other"];

function Sell() {
  const data = useData();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("Cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const pendingReceipt = useRef<string | null>(null);

  const find = (l: CartLine) => {
    const p = data.products.find((x) => x.id === l.productId);
    return { p, v: p?.variants.find((x) => x.id === l.variantId) };
  };
  const results = useMemo(() => {
    const t = q.toLowerCase();
    return data.products.filter((p) => !p.archived).filter((p) => !t || [p.name, p.brand, p.sku, p.barcode ?? "", ...p.variants.map((v) => v.sku + v.label)].some((x) => x.toLowerCase().includes(t))).slice(0, 30);
  }, [data.products, q]);

  const inCart = (variantId: string) => cart.find((c) => c.variantId === variantId)?.quantity ?? 0;
  const add = (productId: string, variantId: string) => {
    const v = data.products.find((p) => p.id === productId)?.variants.find((x) => x.id === variantId);
    if (!v) return;
    if (inCart(variantId) + 1 > v.quantity) { toast.error(`Only ${v.quantity} in stock`); return; }
    setCart((c) => c.some((x) => x.variantId === variantId) ? c.map((x) => x.variantId === variantId ? { ...x, quantity: x.quantity + 1 } : x) : [...c, { productId, variantId, quantity: 1 }]);
  };
  const setQty = (variantId: string, qty: number, max: number) => {
    const n = Math.max(1, Math.min(max, Math.floor(qty) || 1));
    if (qty > max) toast.error(`Only ${max} in stock`);
    setCart((c) => c.map((x) => (x.variantId === variantId ? { ...x, quantity: n } : x)));
  };
  const subtotal = cart.reduce((s, l) => s + (find(l).v?.sellingPrice ?? 0) * l.quantity, 0);
  const disc = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = subtotal - disc;

  const busy = useRef(false);
  const complete = () => {
    if (busy.current) return; // ignore double-clicks
    busy.current = true;
    try {
      const sale = actions.recordSale({ lines: cart, discount: disc, payment, customerName: customerName.trim(), customerPhone: customerPhone.trim() });
      toast.success(`Sale ${sale.number} recorded — ${naira(sale.total)}`, { description: "Stock has been updated." });
      setCart([]); setDiscount(""); setCustomerName(""); setCustomerPhone(""); setPayment("Cash");
      // Wait for the confirmation's focus trap and pointer lock to unmount.
      pendingReceipt.current = sale.id;
      setConfirm(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setTimeout(() => { busy.current = false; }, 400); }
  };

  return (
    <>
      <PageHeader title="Record sale" subtitle="Search products, choose the variation and quantity, then confirm." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-11 pl-9" placeholder="Search products, brand or SKU…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {results.length === 0 ? <EmptyState title="No products found" /> : (
            <div className="space-y-3">
              {results.map((p) => (
                <div key={p.id} className="rounded-2xl border bg-card p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <ProductThumb product={p} />
                    <div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.brand}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.variants.map((v) => {
                      const left = v.quantity - inCart(v.id);
                      return (
                        <button key={v.id} disabled={left <= 0} onClick={() => add(p.id, v.id)}
                          className={cn("rounded-xl border px-3 py-2 text-left text-sm transition-colors", left <= 0 ? "cursor-not-allowed opacity-50" : "hover:border-primary hover:bg-primary-soft")}>
                          <span className="block font-medium">{v.label}</span>
                          <span className="text-xs text-muted-foreground">{naira(v.sellingPrice)} · {left <= 0 ? "out of stock" : `${left} left`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <Panel title="Current sale" className="lg:sticky lg:top-20">
            {cart.length === 0 ? <EmptyState icon={ShoppingCart} title="No items yet" text="Tap a variation to add it." /> : (
              <ul className="divide-y">
                {cart.map((l) => {
                  const { p, v } = find(l);
                  if (!p || !v) return null;
                  return (
                    <li key={l.variantId} className="py-3">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{v.label} · {naira(v.sellingPrice)} each</p></div>
                        <p className="text-sm font-semibold">{naira(v.sellingPrice * l.quantity)}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="icon" variant="outline" className="size-8" aria-label="Decrease" onClick={() => setQty(l.variantId, l.quantity - 1, v.quantity)}><Minus /></Button>
                        <Input type="number" className="h-8 w-16 text-center" value={l.quantity} min={1} max={v.quantity} aria-label="Quantity"
                          onChange={(e) => setQty(l.variantId, Number(e.target.value), v.quantity)} />
                        <Button size="icon" variant="outline" className="size-8" aria-label="Increase" onClick={() => setQty(l.variantId, l.quantity + 1, v.quantity)}><Plus /></Button>
                        <span className="text-xs text-muted-foreground">of {v.quantity}</span>
                        <Button size="icon" variant="ghost" className="ml-auto size-8" aria-label="Remove" onClick={() => setCart((c) => c.filter((x) => x.variantId !== l.variantId))}><Trash2 /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount (₦)"><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
                <Field label="Payment">
                  <Select value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Customer (optional)"><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" /></Field>
                <Field label="Phone (optional)"><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="080…" /></Field>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{naira(subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>−{naira(disc)}</dd></div>
                <div className="flex justify-between font-display text-xl font-bold"><dt>Total</dt><dd>{naira(total)}</dd></div>
              </dl>
              <Button size="lg" className="w-full shadow-glow" disabled={!cart.length} onClick={() => setConfirm(true)}>Confirm sale · {naira(total)}</Button>
            </div>
          </Panel>
        </div>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          const saleId = pendingReceipt.current;
          if (!saleId) return;
          event.preventDefault();
          pendingReceipt.current = null;
          setReceipt(saleId);
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this sale?</AlertDialogTitle>
            <AlertDialogDescription>{cart.reduce((a, l) => a + l.quantity, 0)} items · {naira(total)} by {payment}. Stock will be deducted immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={complete}>Complete sale</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SaleDetailDialog saleId={receipt} onOpenChange={(o) => !o && setReceipt(null)} />
    </>
  );
}
