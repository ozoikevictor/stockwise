import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 font-display text-lg font-bold", light ? "text-sidebar-accent-foreground" : "text-foreground", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow">
        <Boxes className="size-4.5" />
      </span>
      StockWise
    </span>
  );
}
