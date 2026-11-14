import { isDesktop } from "@/lib/store";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, BarChart3, CalendarDays, PackageCheck, Receipt, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shop/Logo";
import hero from "@/assets/shop-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StockWise — Inventory & Daily Sales Tracking for Nigerian Shops" },
      { name: "description", content: "Manage stock, record sales in naira, and track profit from Monday to Sunday." },
      { property: "og:title", content: "StockWise — Inventory & Daily Sales Tracking" },
      { property: "og:description", content: "Manage stock, record sales in naira, and track profit from Monday to Sunday." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: PackageCheck, t: "Products & variations", d: "Sizes, colours and models — each with its own stock and SKU." },
  { icon: TrendingDown, t: "Automatic stock deduction", d: "Every sale subtracts units instantly. No negative stock, ever." },
  { icon: CalendarDays, t: "Monday to Sunday", d: "Daily sales grouped by weekday, with every past week preserved." },
  { icon: Wallet, t: "Revenue & gross profit", d: "Cost price is locked in at sale time so history stays accurate." },
  { icon: Receipt, t: "POS & receipts", d: "Multi-item sales, discounts, Cash, Transfer or POS, printable receipts." },
  { icon: BarChart3, t: "Reports & CSV", d: "Best-sellers, slow movers, low stock — exportable any time." },
];

function Landing() {
  if (isDesktop()) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-hero text-navy-foreground">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo light />
          <div className="flex gap-2">
            <Button asChild variant="ghost" className="text-navy-foreground hover:bg-sidebar-accent hover:text-navy-foreground">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild><Link to="/register">Get started</Link></Button>
          </div>
        </nav>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-2">
          <div>
            <span className="rounded-full bg-sidebar-accent px-3 py-1 text-xs font-medium text-sidebar-primary">For shoes, fashion, gadgets, perfumes & more</span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl">Your shop's stock and sales, always in balance.</h1>
            <p className="mt-5 max-w-lg text-lg text-navy-foreground/70">
              Record a sale and StockWise deducts it from inventory, updates today's revenue and profit, and files it under the right day of the week.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="shadow-glow"><Link to="/register">Create your shop <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-sidebar-border bg-transparent text-navy-foreground hover:bg-sidebar-accent hover:text-navy-foreground">
                <Link to="/login">I have an account</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <img src={hero} alt="Shop shelves with sneakers, clothes and perfumes" width={1280} height={960} className="rounded-3xl object-cover shadow-2xl" />
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold">Everything a busy shop owner needs</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.t} className="rounded-2xl border bg-card p-6 shadow-card">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><f.icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        StockWise - Offline inventory and sales for your shop.
      </footer>
    </div>
  );
}


