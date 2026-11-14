import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/shop/AuthLayout";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Password help - StockWise" }] }),
  component: Forgot,
});

function Forgot() {
  return (
    <AuthLayout title="Password help" subtitle="Contact the shop owner for help with staff access.">
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">The shop owner can reset staff passwords from the Staff page. Owner passwords cannot be reset by email. Keep your owner password in a safe place.</p>
        <Button asChild variant="outline"><Link to="/login">Back to login</Link></Button>
      </div>
    </AuthLayout>
  );
}

