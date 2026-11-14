import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({ label, error, children, htmlFor, hint }: { label: string; error?: string | undefined; children: ReactNode; htmlFor?: string | undefined; hint?: string | undefined }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
