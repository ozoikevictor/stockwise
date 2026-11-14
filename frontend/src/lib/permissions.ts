import type { Role } from "./types";

export type Perm =
  | "sell" | "viewAllSales" | "refund" | "viewProducts" | "manageProducts" | "manageStock"
  | "viewReports" | "manageExpenses" | "manageStaff" | "manageSettings" | "manageData";

const MATRIX: Record<Role, Perm[]> = {
  owner: ["sell", "viewAllSales", "refund", "viewProducts", "manageProducts", "manageStock", "viewReports", "manageExpenses", "manageStaff", "manageSettings", "manageData"],
  cashier: ["sell", "viewProducts"],
  inventory: ["viewProducts"],
};

export const can = (role: Role, perm: Perm) => MATRIX[role].includes(perm);

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner / Administrator", cashier: "Cashier", inventory: "Inventory Manager" };

/** Where each role lands after sign-in. */
export const HOME: Record<Role, "/dashboard" | "/my-dashboard" | "/sell" | "/products"> = { owner: "/dashboard", cashier: "/my-dashboard", inventory: "/products" };


