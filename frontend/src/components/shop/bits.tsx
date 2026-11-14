import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { productQty } from "@/lib/inventory";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string | undefined; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-card", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "primary" }: { label: string; value: string; hint?: string; icon: LucideIcon; tone?: "primary" | "navy" | "warning" }) {
  const tones = { primary: "bg-primary-soft text-primary", navy: "bg-secondary text-secondary-foreground", warning: "bg-warning-soft text-warning" };
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", tones[tone])}><Icon className="size-4.5" /></span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Package, title, text, action }: { icon?: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Icon /></span>
      <p className="mt-3 font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProductThumb({ product, className }: { product: Pick<Product, "name" | "image">; className?: string }) {
  if (product.image) return <img src={product.image} alt={product.name} className={cn("size-10 rounded-lg object-cover", className)} />;
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft font-display text-sm font-bold text-primary", className)}>
      {product.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
    </span>
  );
}

export function StockBadge({ product }: { product: Product }) {
  const q = productQty(product);
  const cls = q === 0 ? "bg-destructive/10 text-destructive" : q <= product.lowStockThreshold ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary";
  const label = q === 0 ? "Out of stock" : q <= product.lowStockThreshold ? "Low stock" : "In stock";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}

export function StatusBadge({ status }: { status: "completed" | "refunded" }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
      status === "completed" ? "bg-primary-soft text-primary" : "bg-destructive/10 text-destructive")}>{status}</span>
  );
}
