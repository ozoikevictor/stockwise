import { RequirePerm } from "@/components/shop/RequirePerm";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Database, Download, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader, Panel } from "@/components/shop/bits";
import { Field } from "@/components/shop/Field";
import { actions, backupDatabase, isDesktop, useCurrentUser, useData } from "@/lib/store";
import { dayKey, downloadFile, fmtDateTime } from "@/lib/format";
import { PasswordInput } from "@/components/shop/PasswordInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_shop/settings")({
  head: () => ({ meta: [{ title: "Settings — StockWise" }, { name: "description", content: "Shop details, appearance and backups." }] }),
  component: () => <RequirePerm perm="manageSettings"><Settings /></RequirePerm>,
});

function Settings() {
  const data = useData();
  const user = useCurrentUser();
  const shop = data.shop!;
  const [name, setName] = useState(shop.name);
  const [address, setAddress] = useState(shop.address);
  const [note, setNote] = useState(shop.receiptNote);
  const [confirm, setConfirm] = useState<"clear" | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Shop details">
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) { toast.error("Enter your shop name"); return; }
            actions.updateShop({ ...shop, name: name.trim(), address: address.trim(), receiptNote: note.trim() });
            toast.success("Settings saved");
          }}>
            <Field label="Shop name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            <Field label="Receipt message"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <p className="text-xs text-muted-foreground">Currency: Nigerian Naira (₦) · Time zone: {shop.timezone}</p>
            <Button type="submit">Save</Button>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Account">
            <p className="text-sm"><b>{user?.name}</b></p>
            <p className="text-sm text-muted-foreground">{user?.email} · {user?.phone}</p>
          </Panel>
          <Panel title="Change password">
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              if (nw.length < 6) { toast.error("New password needs at least 6 characters"); return; }
              if (nw !== nw2) { toast.error("New passwords do not match"); return; }
              try { actions.changeOwnerPassword(cur, nw); setCur(""); setNw(""); setNw2(""); toast.success("Password changed"); }
              catch (er) { toast.error((er as Error).message); }
            }}>
              <Field label="Current password"><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="New password"><PasswordInput value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
                <Field label="Confirm new password"><PasswordInput value={nw2} onChange={(e) => setNw2(e.target.value)} /></Field>
              </div>
              <Button type="submit" variant="outline" disabled={!cur || !nw}>Update password</Button>
            </form>
          </Panel>
          <Panel title="Security">
            <Field label="Lock automatically after inactivity" hint="Shortcut: Ctrl+L locks now · Ctrl+K opens Record Sale">
              <Select value={String(data.prefs.autoLockMinutes)} onValueChange={(v) => actions.setAutoLock(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[["0", "Never"], ["5", "5 minutes"], ["15", "15 minutes"], ["30", "30 minutes"]].map(([v, l]) => <SelectItem key={v} value={v!}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </Panel>
          <Panel title="Appearance">
            <label className="flex items-center justify-between text-sm">Dark mode
              <Switch checked={data.prefs.theme === "dark"} onCheckedChange={(c) => actions.setTheme(c ? "dark" : "light")} />
            </label>
          </Panel>
          <Panel title="Backup & restore">
            <p className="mb-3 text-sm text-muted-foreground">Last backup: {data.prefs.lastBackupAt ? fmtDateTime(data.prefs.lastBackupAt) : "never"}. Save backups to a USB drive — a backup kept only on this computer is lost if the computer fails.</p>
            <div className="flex flex-wrap gap-2">
              {isDesktop() && <Button variant="outline" onClick={() => {
                try { if (backupDatabase()) toast.success("Backup saved"); }
                catch (error) { toast.error((error as Error).message); }
              }}><Database /> Save backup</Button>}
              <Button variant="outline" onClick={() => { downloadFile(`stockwise-backup-${dayKey(new Date())}.json`, actions.exportJSON(), "application/json"); toast.success("Data exported"); }}><Download /> Export shop records</Button>
              <Button variant="outline" onClick={() => file.current?.click()}><Upload /> Import shop records</Button>
              <Button variant="destructive" onClick={() => setConfirm("clear")}><Trash2 /> Start empty</Button>
              <input ref={file} type="file" accept="application/json" className="sr-only" onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                try { actions.importJSON(await f.text()); toast.success("Data imported"); } catch (er) { toast.error((er as Error).message || "Invalid file"); }
              }} />
            </div>
          </Panel>
        </div>
        <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-5 text-sm lg:col-span-2">
          <ShieldAlert className="size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">{isDesktop() ? "Saved on this computer" : "Browser storage"}</p>
            <p className="mt-1 text-foreground/80">{isDesktop() ? "Your records are saved on this computer. Keep a backup on a USB drive. Exporting shop records does not include your account." : "Your records are saved in this browser. Clearing browser data removes them. Keep a backup of your shop records."}</p>
          </div>
        </div>
      </div>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all products and sales?</AlertDialogTitle>
            <AlertDialogDescription>This replaces all products, categories, sales and history in this shop. Export a backup first if you need it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              actions.clearData(); toast.success("Shop emptied");
            }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


