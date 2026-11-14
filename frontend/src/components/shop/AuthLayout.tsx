import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./Logo";



export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-hero p-12 text-navy-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/"><Logo light /></Link>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Know exactly what's on your shelves — and what sold today.</h2>
          <p className="mt-4 max-w-md text-navy-foreground/70">Stock drops automatically with every sale. Monday to Sunday, every naira counted.</p>
        </div>
        <p className="text-sm text-navy-foreground/50">© StockWise</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}


