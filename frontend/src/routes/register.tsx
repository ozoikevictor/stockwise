import {AuthProgress,waitForAuthPaint} from "@/components/shop/AuthProgress";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/shop/AuthLayout";
import { Field } from "@/components/shop/Field";
import { PasswordInput } from "@/components/shop/PasswordInput";
import { actions } from "@/lib/store";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your account — StockWise" },
      { name: "description", content: "Register as a shop owner on StockWise." },
      { property: "og:title", content: "Create your account — StockWise" },
      { property: "og:description", content: "Register as a shop owner on StockWise." },
    ],
  }),
  component: Register,
});

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[+0-9 ]{10,15}$/, "Enter a valid phone number, e.g. 08031234567"),
  password: z.string().min(6, "At least 6 characters"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

export function Register() {
  const nav = useNavigate();
  const submitGuard=useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setSubmitting] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitGuard.current) return;
    const fields = new FormData(event.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fields.entries()));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    submitGuard.current=true;setSubmitting(true);
    try {
      await waitForAuthPaint();
      await actions.register(parsed.data);
      toast.success("Account created");
      await nav({ to: "/setup" });
    } catch (e) { toast.error((e as Error).message); }
    finally { submitGuard.current=false;setSubmitting(false); }
  };
  return (
    <AuthLayout title="Create your owner account" subtitle="Start managing your shop in minutes.">
      <form onSubmit={onSubmit} aria-busy={isSubmitting} noValidate><fieldset disabled={isSubmitting} className="space-y-4">
        <Field label="Full name" htmlFor="name" error={errors["name"]}><Input id="name" name="name" autoComplete="name" placeholder="Chinedu Okafor" /></Field>
        <Field label="Email" htmlFor="email" error={errors["email"]}><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@shop.ng" /></Field>
        <Field label="Phone number" htmlFor="phone" error={errors["phone"]}><Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="08031234567" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={errors["password"]}><PasswordInput id="password" name="password" autoComplete="new-password" /></Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors["confirm"]}><PasswordInput id="confirm" name="confirm" autoComplete="new-password" /></Field>
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting?<AuthProgress label="Creating account…"/>:"Create account"}</Button>
        <p className="text-center text-sm text-muted-foreground">Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></p>
      </fieldset></form>
    </AuthLayout>
  );
}
