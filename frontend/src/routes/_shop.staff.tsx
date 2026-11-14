import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, UserCog, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, Panel } from "@/components/shop/bits";
import { Field } from "@/components/shop/Field";
import { PasswordInput } from "@/components/shop/PasswordInput";
import { RequirePerm } from "@/components/shop/RequirePerm";
import { actions, useData } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import type { Staff } from "@/lib/types";

export const Route = createFileRoute("/_shop/staff")({
  head: () => ({ meta: [{ title: "Staff — StockWise" }, { name: "description", content: "Staff accounts and activity log." }] }),
  component: () => <RequirePerm perm="manageStaff"><StaffPage /></RequirePerm>,
});

const ROLE_HELP = { cashier: "Records sales, prints receipts, sees only their own sales.", inventory: "Legacy read-only catalog access. Change to Cashier to allow sales." };

function StaffPage() {
  const data = useData();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Staff["role"]>("cashier");
  const [pw, setPw] = useState("");
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || username.trim().length < 3 || pw.length < 6) return void toast.error("Enter a name, a username (3+ letters) and a password (6+ characters).");
    try { actions.addStaff({ name, username, role, password: pw }); setName(""); setUsername(""); setPw(""); toast.success("Staff account created"); }
    catch (er) { toast.error((er as Error).message); }
  };
  return (
    <>
      <PageHeader title="Staff" subtitle="Staff sign in from the lock screen (lock icon at the top)." />
      <Tabs defaultValue="staff">
        <TabsList><TabsTrigger value="staff">Accounts</TabsTrigger><TabsTrigger value="audit">Activity log</TabsTrigger></TabsList>
        <TabsContent value="staff" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Add staff member">
              <form onSubmit={add} className="space-y-3">
                <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amaka Eze" /></Field>
                <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="amaka" /></Field>
                <Field label="Role" hint={ROLE_HELP[role]}>
                  <Select value={role} onValueChange={(v) => setRole(v as Staff["role"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cashier">Cashier</SelectItem><SelectItem value="inventory">Catalog viewer (legacy)</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Password"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
                <Button type="submit" className="w-full"><UserPlus /> Create account</Button>
              </form>
            </Panel>
            <div className="space-y-3 lg:col-span-2">
              {data.staff.length === 0 ? <EmptyState icon={UserCog} title="Just you for now" text="StockWise works fully with only the owner account." /> :
                data.staff.map((s) => <StaffRow key={s.id} s={s} />)}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          {data.audit.length === 0 ? <EmptyState title="No activity yet" /> : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Details</th></tr></thead>
                <tbody className="divide-y">
                  {data.audit.slice(0, 300).map((a) => <tr key={a.id}><td className="p-3 text-muted-foreground">{fmtDateTime(a.at)}</td><td className="p-3">{a.actor}</td><td className="p-3 font-medium">{a.action}</td><td className="p-3">{a.detail}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function StaffRow({ s }: { s: Staff }) {
  const [pw, setPw] = useState("");
  const [reset, setReset] = useState(false);
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-navy font-semibold text-navy-foreground">{s.name[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="font-medium">{s.name} <span className="text-xs text-muted-foreground">@{s.username}</span></p><p className="text-xs text-muted-foreground">{ROLE_LABEL[s.role]}</p></div>
        <Select value={s.role} onValueChange={(v) => actions.updateStaff(s.id, { role: v as Staff["role"] })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="cashier">Cashier</SelectItem><SelectItem value="inventory">Catalog viewer (legacy)</SelectItem></SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">Active <Switch checked={s.active} onCheckedChange={(c) => actions.updateStaff(s.id, { active: c })} /></label>
        <Button variant="ghost" size="icon" aria-label="Reset password" onClick={() => setReset((r) => !r)}><KeyRound /></Button>
      </div>
      {reset && (
        <div className="mt-3 flex gap-2">
          <PasswordInput placeholder="New password (6+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button disabled={pw.length < 6} onClick={() => { actions.updateStaff(s.id, { password: pw }); setPw(""); setReset(false); toast.success("Password reset"); }}>Save</Button>
        </div>
      )}
    </div>
  );
}

