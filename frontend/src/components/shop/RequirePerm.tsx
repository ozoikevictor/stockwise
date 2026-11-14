import type { ReactNode } from "react";
import { ShieldX } from "lucide-react";
import { EmptyState } from "./bits";
import { useCan } from "@/lib/store";
import type { Perm } from "@/lib/permissions";

export function RequirePerm({ perm, children }: { perm: Perm; children: ReactNode }) {
  const ok = useCan(perm);
  if (!ok) return <EmptyState icon={ShieldX} title="No access" text="Your role can't open this page. Ask the shop owner." />;
  return <>{children}</>;
}
