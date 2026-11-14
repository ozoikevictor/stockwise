import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Boxes, CalendarDays, FileText, History, LayoutDashboard, LogOut, Menu, Moon, PackagePlus,
  Settings, ShoppingCart, Sun, Tags, Receipt, Wallet, Users, UserCog, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Guard } from "@/components/shop/Guard";
import { Logo } from "@/components/shop/Logo";
import { actions, useActor, useData } from "@/lib/store";
import { LockScreen } from "@/components/shop/LockScreen";
import { can, ROLE_LABEL, type Perm } from "@/lib/permissions";
import { isLowStock } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shop")({
  component: () => <Guard><Shell /></Guard>,
});

const NAV: { to: "/my-dashboard" | "/dashboard" | "/products" | "/categories" | "/add-product" | "/sell" | "/daily-sales" | "/sales" | "/inventory-history" | "/customers" | "/expenses" | "/analytics" | "/reports" | "/notifications" | "/staff" | "/settings"; label: string; icon: typeof Boxes; perm: Perm }[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "viewReports" },
  { to: "/my-dashboard", label: "My dashboard", icon: LayoutDashboard, perm: "sell" },
  { to: "/sell", label: "Record Sale", icon: ShoppingCart, perm: "sell" },
  { to: "/products", label: "Products", icon: Boxes, perm: "viewProducts" },
  { to: "/categories", label: "Categories", icon: Tags, perm: "manageProducts" },
  { to: "/add-product", label: "Add Product", icon: PackagePlus, perm: "manageProducts" },
  { to: "/inventory-history", label: "Inventory & Restocking", icon: History, perm: "manageStock" },
  { to: "/daily-sales", label: "Daily Sales", icon: CalendarDays, perm: "viewReports" },
  { to: "/sales", label: "Sales History", icon: Receipt, perm: "sell" },
  { to: "/customers", label: "Customers", icon: Users, perm: "viewAllSales" },
  { to: "/expenses", label: "Expenses", icon: Wallet, perm: "manageExpenses" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, perm: "viewReports" },
  { to: "/reports", label: "Reports", icon: FileText, perm: "viewReports" },
  { to: "/notifications", label: "Notifications", icon: Bell, perm: "viewProducts" },
  { to: "/staff", label: "Staff", icon: UserCog, perm: "manageStaff" },
  { to: "/settings", label: "Settings & Backup", icon: Settings, perm: "manageSettings" },
];

function NavList({ onNav }: { onNav?: () => void }) {
  const data = useData();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const low = data.products.filter(isLowStock).length;
  const actor = useActor();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5"><Logo light /></div>
      <p className="truncate px-5 pb-3 text-xs text-sidebar-foreground/60">{data.shop?.name}</p>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.filter((n) => actor && can(actor.role, n.perm) && (n.to !== "/my-dashboard" || actor.role === "cashier")).map((n) => {
          const active = path === n.to || (n.to === "/products" && path.startsWith("/product"));
          return (
            <Link key={n.to} to={n.to} onClick={onNav}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}>
              <n.icon className={cn("size-4", active && "text-sidebar-primary")} />
              {n.label}
              {n.to === "/notifications" && low > 0 && (
                <span className="ml-auto rounded-full bg-warning px-1.5 text-xs font-semibold text-navy">{low}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <button onClick={() => { actions.logout(); onNav?.(); nav({ to: "/device-login" }); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
          <LogOut className="size-4" /> Logout
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const [open, setOpen] = useState(false);
  const navTo = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "l") { e.preventDefault(); actions.lock(); }
      if (k === "k") { e.preventDefault(); navTo({ to: "/sell" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navTo]);
  const actor = useActor();
  const data = useData();
  const dark = data.prefs.theme === "dark";
  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 lg:block"><NavList /></aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-none p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <NavList onNav={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => actions.setTheme(dark ? "light" : "dark")}>
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Switch account" title="Switch account (Ctrl+L)" onClick={() => actions.lock()}><UserCog /><span className="sr-only">Switch account</span></Button>
            <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/sell"><ShoppingCart /> Record sale</Link></Button>
            <span className="hidden text-right text-xs leading-tight md:block"><span className="block font-semibold">{actor?.name}</span><span className="text-muted-foreground">{actor && ROLE_LABEL[actor.role]}</span></span>
            <span className="hidden size-9 place-items-center rounded-full bg-navy text-sm font-semibold text-navy-foreground sm:grid" title={actor?.name}>
              {actor?.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 pb-24 sm:p-6"><Outlet /></main>
        <LockScreen />
      </div>
      <Link to="/sell" aria-label="Record sale"
        className="no-print fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow sm:hidden">
        <ShoppingCart />
      </Link>
    </div>
  );
}



