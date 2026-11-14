import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Field } from "@/components/shop/Field";
import { Guard } from "@/components/shop/Guard";
import { Logo } from "@/components/shop/Logo";
import { actions, useCurrentUser, useData } from "@/lib/store";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up your shop — StockWise" },
      { name: "description", content: "Name your shop and start adding your products." },
      { property: "og:title", content: "Set up your shop — StockWise" },
      { property: "og:description", content: "Name your shop and start adding your products." },
    ],
  }),
  component: () => <Guard needShop={false}><Setup /></Guard>,
});

function Setup() {
  const nav = useNavigate();
  const user = useCurrentUser();
  const data = useData();
  const [name, setName] = useState(data.shop?.name ?? "");
  const [address, setAddress] = useState(data.shop?.address ?? "");

  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Enter your shop name");
    actions.setupShop({ name: name.trim(), address: address.trim(), currency: "NGN",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, receiptNote: "Thank you for shopping with us!" }, false);
    toast.success("Your shop is ready");
    nav({ to: "/dashboard" });
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-3xl border bg-card p-8 shadow-card">
        <Logo />
        <div>
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><Store /></span>
          <h1 className="mt-4 text-2xl font-bold">Hi {user?.name.split(" ")[0]}, set up your shop</h1>
          <p className="text-sm text-muted-foreground">You can change these later in Settings.</p>
        </div>
        <Field label="Shop name" htmlFor="shop" error={err}><Input id="shop" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Chinedu's Kicks & Gadgets" /></Field>
        <Field label="Address (optional)" htmlFor="addr"><Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Allen Avenue, Ikeja, Lagos" /></Field>
        <Button type="submit" className="w-full" size="lg">Open my dashboard</Button>
      </form>
    </div>
  );
}

