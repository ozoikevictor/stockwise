import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import { Field } from "./Field";
import { Logo } from "./Logo";
import { PasswordInput } from "./PasswordInput";
import { actions, useActor, useCurrentUser, useData, useLocked } from "@/lib/store";
import { HOME, ROLE_LABEL } from "@/lib/permissions";

/** Full-screen lock / switch-user. Also handles auto-lock after inactivity. */
export function LockScreen() {
  const locked = useLocked();
  const actor = useActor();
  const user = useCurrentUser();
  const data = useData();
  const nav = useNavigate();
  const [who, setWho] = useState("owner");
  const [pw, setPw] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const minutes = data.prefs.autoLockMinutes;

  useEffect(() => { if (locked) { setWho(actor?.kind === "staff" ? actor.id : "owner"); setPw(""); } }, [locked, actor?.id, actor?.kind]);

  useEffect(() => {
    if (!minutes || locked) return;
    let t = window.setTimeout(() => actions.lock(), minutes * 60000);
    const reset = () => { clearTimeout(t); t = window.setTimeout(() => actions.lock(), minutes * 60000); };
    const ev = ["mousemove", "keydown", "click", "touchstart"];
    ev.forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [minutes, locked]);

  if (!locked) return null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const role = actions.unlock(who, pw);
      setPw("");
      toast.success("Signed in");
      nav({ to: HOME[role], replace: true });
    } catch (er) { toast.error((er as Error).message); }
  };
  const people = [{ id: "owner", name: user?.name ?? "Owner", role: ROLE_LABEL.owner }, ...data.staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, role: ROLE_LABEL[s.role] }))];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-hero p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border bg-card p-8 shadow-card">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"><Lock /></span>
          <div><h1 className="text-xl font-bold">Switch account</h1><p className="text-sm text-muted-foreground">{data.shop?.name}</p></div>
        </div>
        <Field label="Sign in as" htmlFor="switch-account">
          <select id="switch-account" value={who} onChange={(e) => { setWho(e.target.value); setPw(""); passwordRef.current?.focus(); }}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
            {people.map(p => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
          </select>
        </Field>
        <p className="text-sm text-muted-foreground">Enter the password for {people.find(p => p.id === who)?.name ?? "the selected account"}.</p>
        <Field label="Password"><PasswordInput ref={passwordRef} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
        <Button type="submit" className="w-full" disabled={!pw}>Sign in</Button>
        <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => { actions.logout(); nav({ to: "/login" }); }}>
          Log out of this shop
        </button>
      </form>
    </div>
  );
}

