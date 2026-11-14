import { OnlineConnection } from "@/components/shop/OnlineConnection";
import { OnlineShell } from "@/components/shop/OnlineShell";
import { AuthLayout } from "@/components/shop/AuthLayout";
import { PageHeader, StatCard, Panel, EmptyState, ProductThumb } from "@/components/shop/bits";
import { Boxes, Receipt, Wallet, TrendingUp, Package } from "lucide-react";
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/shop/PasswordInput';
import { Field } from '@/components/shop/Field';
import { Logo } from '@/components/shop/Logo';
import { OnlineError, onlineRequest as api, type OnlineUser, type OnlineProduct, type OnlineSale } from '@/lib/online-api';

export const Route=createFileRoute('/online')({component:Online});
const amount=(minor:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(minor/100);
const minor=(value:FormDataEntryValue|null)=>{const n=Number(value);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('Enter a valid amount with at most two decimal places');return Math.round(n*100);};
function Online(){
  const [session,setSession]=useState<{token:string;user:OnlineUser}|null>(null);
  const [signup,setSignup]=useState(false);const [busy,setBusy]=useState(false);const [products,setProducts]=useState<OnlineProduct[]>([]);const [sales,setSales]=useState<OnlineSale[]>([]);const [status,setStatus]=useState('');const [tab,setTab]=useState('dashboard');
  const [selected,setSelected]=useState('');const [qty,setQty]=useState(1);const pending=useRef<{idempotencyKey:string;payment:string;lines:{productId:string;quantity:number}[]}|null>(null);const guard=useRef(false);
  const sessionToken=useRef<string|null>(null); sessionToken.current=session?.token ?? null;
  const [restock,setRestock]=useState<OnlineProduct|null>(null);
  const restockRequest=useRef<{quantity:number;idempotencyKey:string}|null>(null);
  const [receipt,setReceipt]=useState<(OnlineSale & {shopName:string;cashierName:string;timezone:string})|null>(null);
  const [switching,setSwitching]=useState(false);
  const [accounts,setAccounts]=useState<{id:string;name:string;role:string}[]>([]);
  const [switchId,setSwitchId]=useState('');
  async function openSwitch(){
    if(!session)return;
    if(pending.current||restockRequest.current){toast.error('Retry the pending sale or restock before switching accounts.');return;}
    try{const people=await api<{id:string;name:string;role:string}[]>('/auth/accounts',session.token);setAccounts(people);setSwitchId(session.user.id);setSwitching(true);}catch(e){toast.error((e as Error).message);}
  }
  const owner=session?.user.role==='owner';
  async function refresh(current=session){if(!current)return;const [p,s]=await Promise.all([api<OnlineProduct[]>('/products',current.token),api<OnlineSale[]>('/sales',current.token)]);if(sessionToken.current!==current.token)return;setProducts(p);setSales(s);setStatus('Updated '+new Date().toLocaleTimeString());}
  useEffect(()=>{if(!session)return;let active=true;const load=()=>refresh(session).catch(e=>{if(active){setStatus(e.message);if(e instanceof OnlineError && e.status===401){setSession(null);setProducts([]);setSales([]);}}});void load();const timer=setInterval(load,10000);return()=>{active=false;clearInterval(timer);};},[session]);
  async function submit(e:FormEvent<HTMLFormElement>,work:(data:FormData)=>Promise<void>){e.preventDefault();if(guard.current)return;guard.current=true;setBusy(true);const form=e.currentTarget;try{await work(new FormData(form));}catch(error){toast.error((error as Error).message);}finally{guard.current=false;setBusy(false);}}
  async function signout(){if(!session)return;if(pending.current||restockRequest.current){toast.error("Retry the pending sale or restock before switching accounts.");return;}setSignup(false);try{await api('/auth/logout',session.token,'POST');}catch{toast.message('Could not revoke the server session. Local sign-in was cleared; the server session will expire.');}setSession(null);setProducts([]);setSales([]);pending.current=null;restockRequest.current=null;setRestock(null);setReceipt(null);setSelected('');setQty(1);setStatus('');}
  if(!session)return <AuthLayout title={signup ? "Create your online shop" : "Welcome back"} subtitle="Owners and cashiers: sign in with your own online email and password."><div className="space-y-5"><OnlineConnection/><p className="text-sm text-muted-foreground">To switch accounts, enter the other account email and password. Owners create cashier accounts from Staff in the online dashboard.</p><form className="space-y-4" onSubmit={e=>submit(e,async f=>{
    const email=String(f.get('email'));const password=String(f.get('password'));
    if(signup)await api('/auth/register',null,'POST',{email,password,name:String(f.get('name')),shopName:String(f.get('shopName'))});
    const result=await api<{token:string;user:OnlineUser}>('/auth/login',null,'POST',{email,password});setProducts([]);setSales([]);setSession(result);setTab('dashboard');toast.success('Signed in online');
  })}>{signup&&<><Field label="Your name"><Input name="name" required/></Field><Field label="Shop name"><Input name="shopName" required/></Field></>}<Field label="Email"><Input name="email" type="email" autoComplete="username" required/></Field><Field label="Password"><PasswordInput name="password" minLength={signup?8:1} autoComplete={signup?'new-password':'current-password'} required/></Field><Button disabled={busy} className="w-full">{busy?'Connecting…':signup?'Create shop and sign in':'Sign in'}</Button></form><Button variant="ghost" onClick={()=>setSignup(!signup)}>{signup?'Already registered? Sign in':'Create an online owner account'}</Button><p><Link to="/login" className="text-sm text-primary">Back to local sign in</Link></p></div></AuthLayout>;
  return <OnlineShell name={session.user.name} owner={owner} tab={tab} onTab={setTab} onSignout={()=>void signout()} onSwitch={()=>void openSwitch()} onRefresh={()=>void refresh().catch(e=>toast.error(e.message))} status={status}>
    {switching&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-hero p-6"><form className="w-full max-w-sm space-y-5 rounded-3xl border bg-card p-8 shadow-card" onSubmit={e=>submit(e,async f=>{
      const result=await api<{token:string;user:OnlineUser}>('/auth/switch',session.token,'POST',{userId:switchId,password:String(f.get('password'))});
      sessionToken.current=result.token;setProducts([]);setSales([]);setReceipt(null);setRestock(null);setSelected('');setQty(1);setStatus('');setSession(result);setTab('dashboard');setSwitching(false);toast.success('Account switched');
    })}><Logo/><h1 className="text-xl font-bold">Switch account</h1><Field label="Sign in as"><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={switchId} onChange={e=>setSwitchId(e.target.value)} disabled={busy}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} - {a.role==='owner'?'Owner':'Cashier'}</option>)}</select></Field><Field label="Password"><PasswordInput key={switchId} name="password" autoComplete="current-password" required autoFocus/></Field><Button className="w-full" disabled={busy}>{busy?'Switching...':'Sign in'}</Button><Button className="w-full" type="button" variant="ghost" disabled={busy} onClick={()=>setSwitching(false)}>Cancel</Button></form></div>}
    <PageHeader title={({dashboard:owner?"Good day, "+session.user.name:"My dashboard",products:"Products",sell:"Record sale",sales:owner?"Sales history":"My sales","add-product":"Add product",staff:"Staff"} as Record<string,string>)[tab] ?? "Shop"} subtitle={tab==="dashboard"?"Your connected shop at a glance.":undefined} />
    {tab==="dashboard"&&<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={owner?"Recent sales revenue":"My recent sales"} value={amount(sales.reduce((n,s)=>n+s.totalMinor,0))} hint="Latest 200 transactions" icon={Wallet}/>
        {owner?<StatCard label="Recent gross profit" value={amount(sales.reduce((n,s)=>n+(s.profitMinor??0),0))} hint="Latest 200 transactions" icon={TrendingUp}/>:<StatCard label="My transactions" value={String(sales.length)} hint="Latest 200 transactions" icon={Receipt}/>}
        <StatCard label="Units in stock" value={String(products.reduce((n,p)=>n+p.quantity,0))} hint={String(products.length)+" products loaded"} icon={Boxes} tone="navy"/>
        {owner?<StatCard label="Inventory value (cost)" value={amount(products.reduce((n,p)=>n+(p.costMinor??0)*p.quantity,0))} hint="Loaded product catalog" icon={Package}/>:<StatCard label="Products available" value={String(products.filter(p=>p.quantity>0).length)} icon={Package}/>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent transactions" action={<Button variant="ghost" onClick={()=>setTab("sales")}>View all</Button>}>{sales.slice(0,5).map(s=><div key={s.id} className="flex justify-between gap-3 border-b py-3 last:border-0"><div><p className="text-sm font-medium">{s.items.map(i=>i.productName).join(", ")}</p><p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p></div><span className="text-sm font-semibold">{amount(s.totalMinor)}</span></div>)}{!sales.length&&<EmptyState icon={Receipt} title="No sales yet" text="Your confirmed sales will appear here."/>}</Panel>
        <Panel title="Out of stock" action={<Button variant="ghost" onClick={()=>setTab("products")}>View products</Button>}>{products.filter(p=>p.quantity===0).map(p=><div key={p.id} className="flex justify-between border-b py-3 text-sm last:border-0"><span>{p.name}</span><span className="rounded-full bg-warning-soft px-2 text-warning">Out of stock</span></div>)}{!products.some(p=>p.quantity===0)&&<EmptyState icon={Boxes} title={products.length?"All stocked up":"No products yet"} text={products.length?"Your loaded products have stock available.":"Add your first product to get started."}/>}</Panel>
      </div>
    </>}
    {tab==='products'&&<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map(p=><div key={p.id} className="space-y-3 rounded-2xl border bg-card p-5 shadow-card"><div className="flex items-center gap-3"><ProductThumb product={{name:p.name,image:""}}/><div><h2 className="font-semibold">{p.name}</h2><p className="text-xs text-muted-foreground">{p.sku}</p></div></div><p>{amount(p.priceMinor)} · {p.quantity} in stock</p>{owner&&p.costMinor!==undefined&&<p className="text-sm text-muted-foreground">Cost: {amount(p.costMinor)}</p>}{owner&&<Button variant="outline" onClick={()=>{if(restockRequest.current){toast.error("Finish the pending restock first");return;}setRestock(p);}}>Restock</Button>}</div>)}{!products.length&&<p>No products yet. The owner can add the first product.</p>}</div>}
    {tab==='add-product'&&owner&&<form className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card" onSubmit={e=>submit(e,async f=>{await api('/products',session.token,'POST',{name:String(f.get('name')),sku:String(f.get('sku')),costMinor:minor(f.get('cost')),priceMinor:minor(f.get('price')),quantity:Number(f.get('quantity'))});await refresh();setTab('products');toast.success('Product added online');})}><Field label="Product name"><Input name="name" required/></Field><Field label="SKU"><Input name="sku" required/></Field><Field label="Cost price (NGN)"><Input name="cost" type="number" min="0" step="0.01" required/></Field><Field label="Selling price (NGN)"><Input name="price" type="number" min="0" step="0.01" required/></Field><Field label="Quantity"><Input name="quantity" type="number" min="0" step="1" required/></Field><Button disabled={busy}>{busy?'Saving…':'Save product'}</Button></form>}
    {tab==='staff'&&owner&&<form className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card" onSubmit={e=>submit(e,async f=>{await api('/staff',session.token,'POST',{name:String(f.get('name')),email:String(f.get('email')),password:String(f.get('password'))});toast.success('Online cashier account created');})}><h2 className="font-semibold">Create cashier</h2><Field label="Full name"><Input name="name" required/></Field><Field label="Email"><Input name="email" type="email" required/></Field><Field label="Password"><PasswordInput name="password" autoComplete="new-password" minLength={8} required/></Field><Button disabled={busy}>{busy?'Creating…':'Create cashier'}</Button></form>}
    {tab==='sell'&&<form className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card" onSubmit={e=>submit(e,async f=>{
      if(!pending.current){if(!selected)throw Error('Select a product');pending.current={idempotencyKey:crypto.randomUUID(),payment:String(f.get('payment')),lines:[{productId:selected,quantity:qty}]};}
      try{await api('/sales',session.token,'POST',pending.current);}catch(error){if(error instanceof OnlineError && [400,403,404,409].includes(error.status)){pending.current=null;throw error;}throw Error((error as Error).message+'. Retry sends the same sale key to prevent a duplicate.');}
      pending.current=null;toast.success('Sale confirmed by server');setTab('sales');await refresh();
    })}><Field label="Product"><select className="h-10 w-full rounded border bg-background px-3" value={selected} onChange={e=>{if(pending.current){toast.error('Retry the pending sale before changing it');return;}setSelected(e.target.value);}} required><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {amount(p.priceMinor)} ({p.quantity} left)</option>)}</select></Field><Field label="Quantity"><Input type="number" min="1" step="1" value={qty} onChange={e=>{if(!pending.current)setQty(Number(e.target.value));}} required/></Field><Field label="Payment"><select name="payment" disabled={!!pending.current} className="h-10 w-full rounded border bg-background px-3">{['Cash','Transfer','POS','Other'].map(p=><option key={p}>{p}</option>)}</select></Field><Button disabled={busy}>{busy?'Submitting…':pending.current?'Retry sale':'Confirm sale'}</Button></form>}
    {tab==='sales'&&<div className="space-y-3">{sales.map(s=><article key={s.id} className="space-y-2 rounded-2xl border bg-card p-5 shadow-card"><p className="font-semibold">{amount(s.totalMinor)} · {s.payment}</p><p className="text-sm">{new Date(s.createdAt).toLocaleString()}</p>{s.items.map((i,n)=><p key={n}>{i.quantity} × {i.productName} — {amount(i.unitPriceMinor)}</p>)}{owner&&s.profitMinor!==undefined&&<p>Gross profit: {amount(s.profitMinor)}</p>}<p className="break-all text-xs text-muted-foreground">Transaction: {s.id}</p><Button variant="outline" onClick={()=>void api<OnlineSale & {shopName:string;cashierName:string;timezone:string}>("/sales/"+s.id+"/receipt",session.token).then(setReceipt).catch(e=>toast.error(e.message))}>View receipt</Button></article>)}{!sales.length&&<p>No sales yet.</p>}</div>}
    {restock&&owner&&<form className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6 shadow-card" onSubmit={e=>submit(e,async f=>{
      if(!restockRequest.current)restockRequest.current={quantity:Number(f.get("quantity")),idempotencyKey:crypto.randomUUID()};
      try{await api("/products/"+restock.id+"/restock",session.token,"POST",restockRequest.current);}catch(error){if(error instanceof OnlineError&&[400,403,404,409].includes(error.status))restockRequest.current=null;throw error;}
      restockRequest.current=null;setRestock(null);await refresh();toast.success("Stock added");
    })}><h2 className="font-semibold">Restock {restock.name}</h2><Field label="Units to add"><Input name="quantity" type="number" min="1" step="1" disabled={!!restockRequest.current} required/></Field><Button disabled={busy}>{busy?"Saving…":restockRequest.current?"Retry restock":"Add stock"}</Button><Button type="button" variant="ghost" disabled={!!restockRequest.current} onClick={()=>setRestock(null)}>Cancel</Button></form>}
    {receipt&&<section className="online-receipt space-y-3 rounded-xl border bg-card p-6"><h2 className="text-xl font-bold">{receipt.shopName}</h2><p>Receipt {receipt.id}</p><p>{new Date(receipt.createdAt).toLocaleString("en-NG",{timeZone:receipt.timezone})}</p><p>Cashier: {receipt.cashierName}</p>{receipt.items.map((i,n)=><p key={n}>{i.quantity} x {i.productName} @ {amount(i.unitPriceMinor)} — {amount(i.quantity*i.unitPriceMinor)}</p>)}<p className="font-bold">Total: {amount(receipt.totalMinor)}</p><p>Payment: {receipt.payment}</p><p>Thank you for shopping with us!</p><div className="online-receipt-controls flex gap-2"><Button onClick={()=>window.print()}>Print receipt</Button><Button variant="outline" onClick={()=>setReceipt(null)}>Close receipt</Button></div></section>}
    <style>{'@media print { body * { visibility: hidden !important; } .online-receipt, .online-receipt * { visibility: visible !important; } .online-receipt { position: absolute; top: 0; left: 0; width: 100%; background: white; color: black; border: none; } .online-receipt-controls, .online-receipt-controls * { display: none !important; } }'}</style>
  </OnlineShell>;
}








