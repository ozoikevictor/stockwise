import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Plus, Trash2, Wallet, TrendingUp, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shop/bits";
import { Field } from "@/components/shop/Field";
import { RangeFilter } from "@/components/shop/RangeFilter";
import { RequirePerm } from "@/components/shop/RequirePerm";
import { actions, useData } from "@/lib/store";
import { expensesIn, inRange, rangeFor, summarize, type RangeKey } from "@/lib/analytics";
import { dayKey, fmtDate, naira } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/types";

export const Route = createFileRoute("/_shop/expenses")({
  head: () => ({ meta: [{ title: "Expenses — StockWise" }, { name: "description", content: "Track rent, electricity, salaries and other shop expenses." }] }),
  component: () => <RequirePerm perm="manageExpenses"><Expenses /></RequirePerm>,
});

function Expenses() {
  const data = useData();
  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [category, setCategory] = useState<string>("Rent");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [f, t] = rangeFor(range, custom);
  const list = useMemo(() => data.expenses.filter((e) => { const x = new Date(e.date).getTime(); return x >= f.getTime() && x < t.getTime(); })
    .sort((a, b) => b.date.localeCompare(a.date)), [data.expenses, f, t]);
  const gross = summarize(inRange(data.sales, f, t)).profit;
  const exp = expensesIn(data, f, t);
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ c, v: list.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) }));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const [y, m, d] = date.split("-").map(Number);
      actions.addExpense({ date: new Date(y!, m! - 1, d!, 12).toISOString(), category, amount: Math.round(Number(amount)), note: note.trim() });
      setAmount(""); setNote(""); toast.success("Expense saved");
    } catch (er) { toast.error((er as Error).message); }
  };

  return (
    <>
      <PageHeader title="Expenses" subtitle="Running costs, kept separate from cost of goods." actions={<RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Gross profit" value={naira(gross)} icon={TrendingUp} />
        <StatCard label="Expenses" value={naira(exp)} icon={Receipt} tone="warning" />
        <StatCard label="Estimated net operating profit" value={naira(gross - exp)} hint="Gross profit − expenses" icon={Wallet} tone="navy" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Add expense">
          <form onSubmit={add} className="space-y-3">
            <Field label="Date"><Input type="date" value={date} max={dayKey(new Date())} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Category">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Amount (₦)"><Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="18000" /></Field>
            <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Prepaid meter" /></Field>
            <Button type="submit" className="w-full" disabled={!(Number(amount) > 0)}><Plus /> Save expense</Button>
          </form>
          <div className="mt-5 space-y-1 border-t pt-4 text-sm">
            {byCat.map((b) => <div key={b.c} className="flex justify-between"><span className="text-muted-foreground">{b.c}</span><span>{naira(b.v)}</span></div>)}
          </div>
        </Panel>
        <Panel title="Expenses in this period" className="lg:col-span-2">
          {list.length === 0 ? <EmptyState icon={Wallet} title="No expenses in this period" /> : (
            <ul className="divide-y">
              {list.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span><span className="font-medium">{e.category}</span>{e.note && ` · ${e.note}`}<span className="block text-xs text-muted-foreground">{fmtDate(e.date)}</span></span>
                  <span className="flex items-center gap-2"><b>{naira(e.amount)}</b>
                    <Button variant="ghost" size="icon" aria-label="Delete expense" onClick={() => { actions.deleteExpense(e.id); toast.success("Expense deleted"); }}><Trash2 /></Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
