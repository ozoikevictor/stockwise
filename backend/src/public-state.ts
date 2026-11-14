import type { State } from "../../frontend/src/lib/store-core";
export function publicReply(raw: State, result?: unknown) {
  const owner = raw.actor?.role === "owner" && !raw.locked;
  const signedIn = !!raw.actor && !raw.locked;
  const safe = {
    ...raw,
    auth: { ...raw.auth, users: raw.auth.users.filter(u => u.id === raw.auth.sessionUserId) },
    data: {
      ...raw.data,
      products: signedIn ? raw.data.products : [],
      categories: signedIn ? raw.data.categories : [],
      sales: owner ? raw.data.sales : signedIn ? raw.data.sales.filter(s => s.cashierId === raw.actor!.id) : [],
      expenses: owner ? raw.data.expenses : [],
      adjustments: owner ? raw.data.adjustments : [],
      audit: owner ? raw.data.audit : [],
      staff: owner ? raw.data.staff : raw.data.staff.filter(s => s.active).map(s => ({ id:s.id, name:s.name, role:s.role, active:s.active })),
    },
  };
  const forbidden = new Set(owner ? ["passwordHash"] : ["passwordHash","costPrice","unitCost","cogs","supplier","profit","grossProfit","netProfit","margin"]);
  const project = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => forbidden.has(key) ? undefined : v));
  return { state: project(safe), result: result === undefined ? undefined : project(result) };
}
