import {PasswordRecovery,takeResetToken} from "@/components/shop/PasswordRecovery";
import {StaffPasswordReset} from "@/components/shop/StaffPasswordReset";
import {AuthProgress,waitForAuthPaint} from "@/components/shop/AuthProgress";
import { onlineStore, useOnlineStore } from "@/lib/store";
import type { OnlineSession } from "@/lib/online-sync-core";
import { OnlineShell } from "@/components/shop/OnlineShell";
import { AuthLayout } from "@/components/shop/AuthLayout";
import { PageHeader, StatCard, Panel, EmptyState, ProductThumb } from "@/components/shop/bits";
import { Boxes, Receipt, Wallet, TrendingUp, Package } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/shop/PasswordInput";
import { Field } from "@/components/shop/Field";
import { Logo } from "@/components/shop/Logo";
import {
  OnlineError,
  onlineRequest as api,
  type OnlineUser,
  type OnlineProduct,
  type OnlineSale,
} from "@/lib/online-api";

export const Route = createFileRoute("/online")({ component: Online });
const amount = (minor: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);
const minor = (value: FormDataEntryValue | null) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001)
    throw Error("Enter a valid amount with at most two decimal places");
  return Math.round(n * 100);
};
function Online() {
  const [recoveryOpen,setRecoveryOpen]=useState(false);
  const [resetToken,setResetToken]=useState(takeResetToken);
  const synced = useOnlineStore();
  const session = synced.session;
  const products = onlineStore.available();
  const sales = synced.cache.sales;
  const [reauth, setReauth] = useState(false);
  const waiting = onlineStore.pending();
  const status =
    (synced.connected ? "Connected" : "Offline / connection unavailable") +
    " · " +
    waiting.length +
    " pending · " +
    synced.message;
  async function setSession(value: OnlineSession | null) {
    if (value) await onlineStore.signIn(value);
    else await onlineStore.signOut();
  }
  async function refresh() {
    await onlineStore.sync();
  }
  const [signup, setSignup] = useState(false);
  const [authLoading,setAuthLoading]=useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [staffVersion,setStaffVersion]=useState(0);
  const [selected, setSelected] = useState("");
  const [qty, setQty] = useState(1);
  const guard = useRef(false);
  const sessionToken = useRef<string | null>(null);
  sessionToken.current = session?.token ?? null;
  const [restock, setRestock] = useState<OnlineProduct | null>(null);
  const restockRequest = useRef<{ quantity: number; idempotencyKey: string } | null>(null);
  const [receipt, setReceipt] = useState<
    (OnlineSale & { shopName: string; cashierName: string; timezone: string }) | null
  >(null);
  useEffect(() => {
    if (!receipt) return;
    const saved = synced.cache.queue.find((q) => q.id === receipt.id);
    if (saved?.state === "confirmed") {
      setReceipt(null);
      toast.success("Sale synced. The final receipt is in Sales History.");
    }
  }, [synced.cache.queue, receipt]);
  const [switching, setSwitching] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; name: string; role: string }[]>([]);
  const [switchId, setSwitchId] = useState("");
  async function openSwitch() {
    if (!session || reauth) return;
    if (waiting.length || synced.syncing || restockRequest.current) {
      toast.error("Retry the pending sale or restock before switching accounts.");
      return;
    }
    try {
      const people = await api<{ id: string; name: string; role: string }[]>(
        "/auth/accounts",
        session.token,
      );
      setAccounts(people);
      setSwitchId(session.user.id);
      setSwitching(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const owner = session?.user.role === "owner";
  useEffect(() => {
    void onlineStore.restore();
  }, []);
  useEffect(() => {
    if (!session || switching || reauth || authLoading || recoveryOpen || resetToken) return;
    const run = () => {
      void onlineStore.sync();
    };
    run();
    const timer = setInterval(run, 10000);
    window.addEventListener("online", run);
    window.addEventListener("offline", onlineStore.markOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("offline", onlineStore.markOffline);
    };
  }, [session, switching, reauth, authLoading,recoveryOpen,resetToken]);
  async function submit(e: FormEvent<HTMLFormElement>, work: (data: FormData) => Promise<void>) {
    e.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    const form = e.currentTarget;
    try {
      await work(new FormData(form));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function signout() {
    if (!session) return;
    if (waiting.length || synced.syncing || restockRequest.current) {
      toast.error("Sync or resolve pending sales before signing out.");
      return;
    }
    const token = session.token;
    await setSession(null);
    setSignup(false);
    setReceipt(null);
    setRestock(null);
    setSelected("");
    setQty(1);
    try {
      await api("/auth/logout", token, "POST");
    } catch {
      toast.message("Signed out on this device. Server session will expire.");
    }
  }
  if(recoveryOpen||resetToken)return <PasswordRecovery token={resetToken} onBack={()=>{setRecoveryOpen(false);setResetToken('');}} onDone={()=>{setRecoveryOpen(false);setResetToken('');setReauth(!!session);}}/>;
  if(authLoading)return <AuthLayout title={signup?"Creating your account":"Signing in"} subtitle=""><div className="flex min-h-40 items-center justify-center"><AuthProgress label={signup?"Creating account…":"Signing in…"}/></div></AuthLayout>;
  if (!synced.ready)
    return (
      <AuthLayout title="Loading saved shop" subtitle="Opening your shop.">
        <p>Please wait…</p>
      </AuthLayout>
    );
  if (!session || reauth)
    return (
      <AuthLayout
        title={signup ? "Create your shop" : "Welcome back"}
        subtitle="Sign in to your shop."
      >
        <div className="space-y-5">
          {reauth && (
            <Button type="button" variant="ghost" onClick={() => setReauth(false)}>
              Back to saved shop
            </Button>
          )}

          <form
            className="space-y-4"
            aria-busy={busy}
            onSubmit={(e) =>
              submit(e, async (f) => {
                setAuthLoading(true);
                try{await waitForAuthPaint();
                const email = String(f.get("email"));
                const password = String(f.get("password"));
                if (signup)
                  await api("/auth/register", null, "POST", {
                    email,
                    password,
                    name: String(f.get("name")),
                    shopName: String(f.get("shopName")),
                  });
                const result = await api<OnlineSession>("/auth/login", null, "POST", {
                  email,
                  password,
                });
                await setSession(result);
                setReauth(false);
                setTab("dashboard");
                await onlineStore.sync();
                toast.success("Welcome back");
                }finally{setAuthLoading(false);}
              })
            }
          >
            {signup && (
              <>
                <Field label="Your name">
                  <Input name="name" required />
                </Field>
                <Field label="Shop name">
                  <Input name="shopName" required />
                </Field>
              </>
            )}
            <Field label="Email">
              <Input name="email" type="email" autoComplete="username" required />
            </Field>
            <Field label="Password">
              <PasswordInput
                name="password"
                minLength={signup ? 8 : 1}
                autoComplete={signup ? "new-password" : "current-password"}
                required
              />
            </Field>
            {!signup&&<div className="text-right"><Button type="button" variant="link" className="h-auto p-0" disabled={busy} onClick={()=>setRecoveryOpen(true)}>Forgot password?</Button></div>}
            <Button disabled={busy} className="w-full">
              {busy ? "Connecting…" : signup ? "Create shop and sign in" : "Sign in"}
            </Button>
          </form>
          <Button variant="ghost" disabled={busy} onClick={() => setSignup(!signup)}>
            {signup ? "Already registered? Sign in" : "Create shop"}
          </Button>
        </div>
      </AuthLayout>
    );
  return (
    <OnlineShell
      name={session.user.name}
      owner={owner}
      tab={tab}
      onTab={setTab}
      onSignout={() => void signout().catch((e) => toast.error(e.message))}
      onSwitch={() => void openSwitch()}
      onRefresh={() => void refresh().catch((e) => toast.error(e.message))}
      status={status}
      connected={synced.connected}
      syncing={synced.syncing}
      pendingCount={waiting.length}
    >
      {(waiting.length > 0 ||
        (!synced.connected && synced.message) ||
        /sign in|expired|server update|read offline/i.test(synced.message)) && (
        <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Sync status">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {waiting.length
                ? waiting.length + " sale" + (waiting.length === 1 ? "" : "s") + " waiting to sync"
                : synced.message}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={synced.syncing}
              onClick={() => void onlineStore.sync()}
            >
              Retry sync
            </Button>
            {/sign in|expired/i.test(synced.message) && (
              <Button size="sm" onClick={() => setReauth(true)}>
                Sign in
              </Button>
            )}
          </div>
          {waiting.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm">View pending sales</summary>
              <div className="mt-3 space-y-3">
                {waiting.map((q) => (
                  <article key={q.id} className="space-y-2 rounded-lg border p-3">
                    <p className="font-medium">
                      {q.productName} - {amount(q.totalMinor)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(q.savedAt).toLocaleString()} -{" "}
                      {q.state === "review" ? "Needs review" : "Waiting to sync"}
                    </p>
                    {q.error && <p className="text-sm text-destructive">{q.error}</p>}
                    {q.state === "review" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={synced.syncing}
                          onClick={() =>
                            void onlineStore
                              .review(q.id, "retry")
                              .then(() => onlineStore.sync())
                              .catch((e) => toast.error(e.message))
                          }
                        >
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={synced.syncing}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Mark this rejected sale resolved? Check any goods or payment first. The record will be kept.",
                              )
                            )
                              void onlineStore
                                .review(q.id, "cancel")
                                .catch((e) => toast.error(e.message));
                          }}
                        >
                          Mark resolved
                        </Button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      {switching && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-hero p-6">
          <form
            className="w-full max-w-sm space-y-5 rounded-3xl border bg-card p-8 shadow-card"
            onSubmit={(e) =>
              submit(e, async (f) => {
                if (onlineStore.getState().syncing)
                  throw Error("Wait for synchronization to finish before switching.");
                const result = await api<OnlineSession>("/auth/switch", session.token, "POST", {
                  userId: switchId,
                  password: String(f.get("password")),
                });
                sessionToken.current = result.token;
                await setSession(result);
                setReceipt(null);
                setRestock(null);
                setSelected("");
                setQty(1);
                setTab("dashboard");
                setSwitching(false);
                toast.success("Account switched");
              })
            }
          >
            <Logo />
            <h1 className="text-xl font-bold">Switch account</h1>
            <Field label="Sign in as">
              <select
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={switchId}
                onChange={(e) => setSwitchId(e.target.value)}
                disabled={busy}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} - {a.role === "owner" ? "Owner" : "Cashier"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Password">
              <PasswordInput
                key={switchId}
                name="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </Field>
            <Button className="w-full" disabled={busy}>
              {busy ? "Switching..." : "Sign in"}
            </Button>
            <Button
              className="w-full"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setSwitching(false)}
            >
              Cancel
            </Button>
          </form>
        </div>
      )}
      <PageHeader
        title={
          (
            {
              dashboard: owner ? "Good day, " + session.user.name : "My dashboard",
              products: "Products",
              sell: "Record sale",
              sales: owner ? "Sales history" : "My sales",
              "add-product": "Add product",
              staff: "Staff",
            } as Record<string, string>
          )[tab] ?? "Shop"
        }
        subtitle={tab === "dashboard" ? "Your connected shop at a glance." : undefined}
      />
      {tab === "dashboard" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={owner ? "Recent sales revenue" : "My recent sales"}
              value={amount(sales.reduce((n, s) => n + s.totalMinor, 0))}
              hint="Latest 200 transactions"
              icon={Wallet}
            />
            {owner ? (
              <StatCard
                label="Recent gross profit"
                value={amount(sales.reduce((n, s) => n + (s.profitMinor ?? 0), 0))}
                hint="Latest 200 transactions"
                icon={TrendingUp}
              />
            ) : (
              <StatCard
                label="My transactions"
                value={String(sales.length)}
                hint="Latest 200 transactions"
                icon={Receipt}
              />
            )}
            <StatCard
              label="Units in stock"
              value={String(products.reduce((n, p) => n + p.quantity, 0))}
              hint={String(products.length) + " products loaded"}
              icon={Boxes}
              tone="navy"
            />
            {owner ? (
              <StatCard
                label="Inventory value (cost)"
                value={amount(products.reduce((n, p) => n + (p.costMinor ?? 0) * p.quantity, 0))}
                hint="Loaded product catalog"
                icon={Package}
              />
            ) : (
              <StatCard
                label="Products available"
                value={String(products.filter((p) => p.quantity > 0).length)}
                icon={Package}
              />
            )}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Recent transactions"
              action={
                <Button variant="ghost" onClick={() => setTab("sales")}>
                  View all
                </Button>
              }
            >
              {sales.slice(0, 5).map((s) => (
                <div key={s.id} className="flex justify-between gap-3 border-b py-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {s.items.map((i) => i.productName).join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{amount(s.totalMinor)}</span>
                </div>
              ))}
              {!sales.length && (
                <EmptyState
                  icon={Receipt}
                  title="No sales yet"
                  text="Your confirmed sales will appear here."
                />
              )}
            </Panel>
            <Panel
              title="Out of stock"
              action={
                <Button variant="ghost" onClick={() => setTab("products")}>
                  View products
                </Button>
              }
            >
              {products
                .filter((p) => p.quantity === 0)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between border-b py-3 text-sm last:border-0"
                  >
                    <span>{p.name}</span>
                    <span className="rounded-full bg-warning-soft px-2 text-warning">
                      Out of stock
                    </span>
                  </div>
                ))}
              {!products.some((p) => p.quantity === 0) && (
                <EmptyState
                  icon={Boxes}
                  title={products.length ? "All stocked up" : "No products yet"}
                  text={
                    products.length
                      ? "Your loaded products have stock available."
                      : "Add your first product to get started."
                  }
                />
              )}
            </Panel>
          </div>
        </>
      )}
      {tab === "products" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-center gap-3">
                <ProductThumb product={{ name: p.name, image: "" }} />
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-xs text-muted-foreground">{p.sku}</p>
                </div>
              </div>
              <p>
                {amount(p.priceMinor)} · {p.quantity} in stock
              </p>
              {owner && p.costMinor !== undefined && (
                <p className="text-sm text-muted-foreground">Cost: {amount(p.costMinor)}</p>
              )}
              {owner && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (restockRequest.current) {
                      toast.error("Finish the pending restock first");
                      return;
                    }
                    setRestock(p);
                  }}
                >
                  Restock
                </Button>
              )}
            </div>
          ))}
          {!products.length && <p>No products yet. The owner can add the first product.</p>}
        </div>
      )}
      {tab === "add-product" && owner && (
        <form
          className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card"
          onSubmit={(e) =>
            submit(e, async (f) => {
              await api("/products", session.token, "POST", {
                name: String(f.get("name")),
                sku: String(f.get("sku")),
                costMinor: minor(f.get("cost")),
                priceMinor: minor(f.get("price")),
                quantity: Number(f.get("quantity")),
              });
              await refresh();
              setTab("products");
              toast.success("Product added online");
            })
          }
        >
          <Field label="Product name">
            <Input name="name" required />
          </Field>
          <Field label="SKU">
            <Input name="sku" required />
          </Field>
          <Field label="Cost price (NGN)">
            <Input name="cost" type="number" min="0" step="0.01" required />
          </Field>
          <Field label="Selling price (NGN)">
            <Input name="price" type="number" min="0" step="0.01" required />
          </Field>
          <Field label="Quantity">
            <Input name="quantity" type="number" min="0" step="1" required />
          </Field>
          <Button disabled={busy}>{busy ? "Saving…" : "Save product"}</Button>
        </form>
      )}
      {tab === "staff" && owner && (
        <form
          className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card"
          onSubmit={(e) =>
            submit(e, async (f) => {
              await api("/staff", session.token, "POST", {
                name: String(f.get("name")),
                email: String(f.get("email")),
                password: String(f.get("password")),
              });
              setStaffVersion(v=>v+1);toast.success("Cashier account created");
            })
          }
        >
          <h2 className="font-semibold">Create cashier</h2>
          <Field label="Full name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Password">
            <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Button disabled={busy}>{busy ? "Creating…" : "Create cashier"}</Button>
        </form>
      )}
      {tab === "staff" && owner && <StaffPasswordReset key={staffVersion} token={session.token}/>}
      {tab === "sell" && (
        <form
          className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card"
          onSubmit={(e) =>
            submit(e, async (f) => {
              await onlineStore.enqueue(selected, qty, String(f.get("payment")));
              toast.success("Sale saved on this device. Waiting for server confirmation.");
              setSelected("");
              setQty(1);
              void onlineStore.sync();
            })
          }
        >
          <Field label="Product">
            <select
              className="h-10 w-full rounded border bg-background px-3"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              required
            >
              <option value="">Choose product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.quantity < 1}>
                  {p.name} - {amount(p.priceMinor)} ({p.quantity} available)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <Input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              required
            />
          </Field>
          <Field label="Payment">
            <select name="payment" className="h-10 w-full rounded border bg-background px-3">
              {["Cash", "Transfer", "POS", "Other"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Button disabled={busy}>{busy ? "Saving…" : "Save sale"}</Button>
        </form>
      )}
      {tab === "sales" && (
        <div className="space-y-3">
          {synced.cache.queue
            .filter((q) => q.state !== "confirmed")
            .map((q) => (
              <article key={q.id} className="space-y-2 rounded-2xl border bg-card p-5">
                <p className="font-semibold">
                  {q.productName} - {amount(q.totalMinor)}
                </p>
                <p>
                  {q.state === "cancelled"
                    ? "Cancelled after server rejection"
                    : q.state === "review"
                      ? "Needs review"
                      : "Saved on this device - not yet confirmed"}
                </p>
                <p className="text-sm">
                  {new Date(q.savedAt).toLocaleString()} - {q.payment}
                </p>
                <p className="break-all text-xs">{q.id}</p>
                {q.error && <p className="text-destructive">{q.error}</p>}
                {q.state !== "cancelled" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setReceipt({
                        id: q.id,
                        cashierId: session.user.id,
                        totalMinor: q.totalMinor,
                        payment: q.payment,
                        createdAt: q.savedAt,
                        items: q.lines.map((l) => ({
                          productId: l.productId,
                          productName: q.productName,
                          quantity: l.quantity,
                          unitPriceMinor: l.expectedPriceMinor,
                        })),
                        shopName: "StockWise - PENDING SERVER CONFIRMATION",
                        cashierName: session.user.name,
                        timezone: "Africa/Lagos",
                      })
                    }
                  >
                    Print pending receipt
                  </Button>
                )}
              </article>
            ))}
          {sales.map((s) => (
            <article key={s.id} className="space-y-2 rounded-2xl border bg-card p-5 shadow-card">
              <p className="font-semibold">
                {amount(s.totalMinor)} · {s.payment}
              </p>
              <p className="text-sm">{new Date(s.createdAt).toLocaleString()}</p>
              {s.items.map((i, n) => (
                <p key={n}>
                  {i.quantity} × {i.productName} — {amount(i.unitPriceMinor)}
                </p>
              ))}
              {owner && s.profitMinor !== undefined && <p>Gross profit: {amount(s.profitMinor)}</p>}
              <p className="break-all text-xs text-muted-foreground">Transaction: {s.id}</p>
              <Button
                variant="outline"
                onClick={() =>
                  void api<
                    OnlineSale & { shopName: string; cashierName: string; timezone: string }
                  >("/sales/" + s.id + "/receipt", session.token)
                    .then(setReceipt)
                    .catch((e) => toast.error(e.message))
                }
              >
                View receipt
              </Button>
            </article>
          ))}
          {!sales.length && !synced.cache.queue.length && <p>No sales yet.</p>}
        </div>
      )}
      {restock && owner && (
        <form
          className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card"
          onSubmit={(e) =>
            submit(e, async (f) => {
              if (!restockRequest.current)
                restockRequest.current = {
                  quantity: Number(f.get("quantity")),
                  idempotencyKey: crypto.randomUUID(),
                };
              try {
                await api(
                  "/products/" + restock.id + "/restock",
                  session.token,
                  "POST",
                  restockRequest.current,
                );
              } catch (error) {
                if (error instanceof OnlineError && [400, 403, 404, 409].includes(error.status))
                  restockRequest.current = null;
                throw error;
              }
              restockRequest.current = null;
              setRestock(null);
              await refresh();
              toast.success("Stock added");
            })
          }
        >
          <h2 className="font-semibold">Restock {restock.name}</h2>
          <Field label="Units to add">
            <Input
              name="quantity"
              type="number"
              min="1"
              step="1"
              disabled={!!restockRequest.current}
              required
            />
          </Field>
          <Button disabled={busy}>
            {busy ? "Saving…" : restockRequest.current ? "Retry restock" : "Add stock"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!!restockRequest.current}
            onClick={() => setRestock(null)}
          >
            Cancel
          </Button>
        </form>
      )}
      {receipt && (
        <section className="online-receipt space-y-3 rounded-xl border bg-card p-6">
          <h2 className="text-xl font-bold">{receipt.shopName}</h2>
          <p>Receipt {receipt.id}</p>
          <p>
            {new Date(receipt.createdAt).toLocaleString("en-NG", { timeZone: receipt.timezone })}
          </p>
          <p>Cashier: {receipt.cashierName}</p>
          {receipt.items.map((i, n) => (
            <p key={n}>
              {i.quantity} x {i.productName} @ {amount(i.unitPriceMinor)} —{" "}
              {amount(i.quantity * i.unitPriceMinor)}
            </p>
          ))}
          <p className="font-bold">Total: {amount(receipt.totalMinor)}</p>
          <p>Payment: {receipt.payment}</p>
          <p>Thank you for shopping with us!</p>
          <div className="online-receipt-controls flex gap-2">
            <Button onClick={() => window.print()}>Print receipt</Button>
            <Button variant="outline" onClick={() => setReceipt(null)}>
              Close receipt
            </Button>
          </div>
        </section>
      )}
      <style>
        {
          "@media print { body * { visibility: hidden !important; } .online-receipt, .online-receipt * { visibility: visible !important; } .online-receipt { position: absolute; top: 0; left: 0; width: 100%; background: white; color: black; border: none; } .online-receipt-controls, .online-receipt-controls * { display: none !important; } }"
        }
      </style>
    </OnlineShell>
  );
}
