import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser, useData, useReady } from "@/lib/store";

export function LoadingScreen() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

/** Demo guard: reads the local session. Not a security boundary. */
export function Guard({ children, needShop = true }: { children: ReactNode; needShop?: boolean }) {
  const ready = useReady();
  const user = useCurrentUser();
  const data = useData();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/device-login" />;
  if (needShop && !data.shop) return <Navigate to="/setup" />;
  return <>{children}</>;
}
