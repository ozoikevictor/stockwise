import { createFileRoute, Link } from "@tanstack/react-router";
import { RequirePerm } from "@/components/shop/RequirePerm";
import { PageHeader, StatCard } from "@/components/shop/bits";
import { Button } from "@/components/ui/button";
import { useActor, useData } from "@/lib/store";
import { naira } from "@/lib/format";
import { Receipt, ShoppingCart, Boxes } from "lucide-react";

export const Route = createFileRoute("/_shop/my-dashboard")({ component: () => <RequirePerm perm="sell"><MyDashboard /></RequirePerm> });
function MyDashboard() {
  const data = useData();
  const actor = useActor();
  const date = (value: string) => new Intl.DateTimeFormat("en-CA", {timeZone:data.shop?.timezone || "Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
  const today = date(new Date().toISOString());
  const sales = data.sales.filter(s => s.cashierId === actor?.id && s.status === "completed" && date(s.createdAt) === today);
  return <><PageHeader title="My dashboard" subtitle={actor?.name ?? ""} actions={<Button asChild><Link to="/sell">Record sale</Link></Button>} />
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Today's sales" value={naira(sales.reduce((n,s)=>n+s.total,0))} icon={Receipt} /><StatCard label="Today's transactions" value={String(sales.length)} icon={ShoppingCart} /><StatCard label="Items sold today" value={String(sales.reduce((n,s)=>n+s.items.reduce((m,i)=>m+i.quantity,0),0))} icon={Boxes} /></div>
    <Button asChild variant="outline" className="mt-6"><Link to="/sales">My sales history</Link></Button></>;
}
