import { useState } from "react";
import { toast } from "sonner";
import { Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./bits";
import { actions, useCan, useData } from "@/lib/store";
import { fmtDateTime, naira } from "@/lib/format";
import type { Sale } from "@/lib/types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function printReceipt(sale: Sale, shopName: string, address: string, note: string) {
  if (window.stockwiseDesktop) {
    void window.stockwiseDesktop.printReceipt(sale.id).then((reply) => {
      if (!reply.ok) toast.error(reply.error ?? "Could not print receipt.");
    }).catch(() => toast.error("Could not print receipt."));
    return;
  }
  shopName = esc(shopName); address = esc(address); note = esc(note);
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) { toast.error("Allow pop-ups to print receipts."); return; }
  const rows = sale.items.map((i) => `<tr><td>${esc(i.productName)}<br><small>${esc(i.variantLabel)} × ${i.quantity}</small></td><td style="text-align:right">${naira(i.quantity * i.unitPrice)}</td></tr>`).join("");
  w.document.write(`<html><head><title>${sale.number}</title><style>body{font-family:monospace;padding:16px;font-size:13px}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}hr{border:none;border-top:1px dashed #000}.c{text-align:center}</style></head><body>
  <div class="c"><b style="font-size:16px">${shopName}</b><br>${address}<br>${fmtDateTime(sale.createdAt)}<br>Receipt ${sale.number}</div><hr>
  <table>${rows}</table><hr><table>
  <tr><td>Subtotal</td><td style="text-align:right">${naira(sale.subtotal)}</td></tr>
  <tr><td>Discount</td><td style="text-align:right">-${naira(sale.discount)}</td></tr>
  <tr><td><b>Total</b></td><td style="text-align:right"><b>${naira(sale.total)}</b></td></tr>
  <tr><td>Paid by</td><td style="text-align:right">${sale.payment}</td></tr></table>
  ${sale.customerName ? `<p>Customer: ${esc(sale.customerName)} ${esc(sale.customerPhone)}</p>` : ""}
  ${sale.status === "refunded" ? "<p class='c'><b>*** REFUNDED ***</b></p>" : ""}
  <hr><p class="c">${note}</p><script>window.print()</script></body></html>`);
  w.document.close();
}

export function SaleDetailDialog({ saleId, onOpenChange }: { saleId: string | null; onOpenChange: (o: boolean) => void }) {
  const data = useData();
  const sale = data.sales.find((s) => s.id === saleId) ?? null;
  const canRefund = useCan("refund");
  const financial = useCan("viewReports");
  const [refunding, setRefunding] = useState(false);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const close = (o: boolean) => { if (!o) { setRefunding(false); setReason(""); setRestock(true); } onOpenChange(o); };
  if (!sale) return null;
  const doRefund = () => {
    try {
      actions.refundSale(sale.id, restock, reason.trim());
      toast.success(restock ? "Sale refunded and items restocked" : "Sale refunded");
      setRefunding(false);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Dialog open={!!saleId} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Receipt {sale.number} <StatusBadge status={sale.status} /></DialogTitle>
          <DialogDescription>{fmtDateTime(sale.createdAt)} · {sale.payment}{sale.cashierName && ` · by ${sale.cashierName}`}{sale.customerName && ` · ${sale.customerName}`}</DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-xl border">
          {sale.items.map((i) => (
            <div key={i.variantId} className="flex justify-between gap-3 p-3 text-sm">
              <div><p className="font-medium">{i.productName}</p><p className="text-xs text-muted-foreground">{i.variantLabel} · {i.quantity} × {naira(i.unitPrice)}</p></div>
              <p className="font-medium">{naira(i.quantity * i.unitPrice)}</p>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right">{naira(sale.subtotal)}</dd>
          <dt className="text-muted-foreground">Discount</dt><dd className="text-right">−{naira(sale.discount)}</dd>
          <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{naira(sale.total)}</dd>
          {financial && <><dt className="text-muted-foreground">Cost of goods</dt><dd className="text-right">{naira(sale.cogs)}</dd>
          <dt className="text-muted-foreground">Gross profit</dt><dd className="text-right text-primary">{naira(sale.total - sale.cogs)}</dd></>}
        </dl>
        {sale.refund && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm">Refunded {fmtDateTime(sale.refund.at)} · {sale.refund.restocked ? "items returned to stock" : "not restocked"}{sale.refund.reason && ` · ${sale.refund.reason}`}</p>
        )}
        {refunding && (
          <div className="space-y-3 rounded-xl border p-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={restock} onCheckedChange={(c) => setRestock(!!c)} /> Return items to stock</label>
            <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">A sale can only be refunded once, so items can never be restocked twice.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRefunding(false)}>Back</Button>
              <Button variant="destructive" size="sm" onClick={doRefund}>Confirm refund</Button>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)}>Close receipt</Button>
          {canRefund && sale.status === "completed" && !refunding && (
            <Button variant="outline" onClick={() => setRefunding(true)}><Undo2 /> Cancel / refund</Button>
          )}
          <Button onClick={() => printReceipt(sale, data.shop?.name ?? "", data.shop?.address ?? "", data.shop?.receiptNote ?? "")}><Printer /> Print receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

