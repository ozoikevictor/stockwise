import {useRef,useState} from "react";
import {AuthProgress,waitForAuthPaint} from "@/components/shop/AuthProgress";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/shop/AuthLayout";
import { Field } from "@/components/shop/Field";
import { PasswordInput } from "@/components/shop/PasswordInput";
import { actions } from "@/lib/store";

export const Route = createFileRoute("/device-login")({
  head: () => ({
    meta: [
      { title: "Log in — StockWise" },
      { name: "description", content: "Log in to your StockWise shop dashboard." },
      { property: "og:title", content: "Log in — StockWise" },
      { property: "og:description", content: "Log in to your StockWise shop dashboard." },
    ],
  }),
  component: Login,
});

const schema = z.object({ email: z.string().trim().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });

function Login() {
  const nav = useNavigate();
  const submitGuard=useRef(false);
  const [isSubmitting,setSubmitting]=useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (d) => {
    if(submitGuard.current)return;submitGuard.current=true;setSubmitting(true);
    try {
      await waitForAuthPaint();
      const { hasShop } = await actions.login(d.email, d.password);
      toast.success("Welcome back");
      await nav({ to: hasShop ? "/dashboard" : "/setup" });
    } catch (e) { toast.error((e as Error).message); }
    finally{submitGuard.current=false;setSubmitting(false);}
  });
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your shop dashboard.">
      <form onSubmit={onSubmit} aria-busy={isSubmitting} noValidate><fieldset disabled={isSubmitting} className="space-y-4">
        <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" {...register("email")} /></Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}><PasswordInput id="password" {...register("password")} /></Field>
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting?<AuthProgress label="Signing in…"/>:"Log in"}</Button>
        <p className="text-center text-sm text-muted-foreground">New here? <Link to="/register" className="font-medium text-primary hover:underline">Create an account</Link></p>
      </fieldset></form>
    </AuthLayout>
  );
}

