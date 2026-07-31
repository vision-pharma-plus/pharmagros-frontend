"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/stores/auth";

/** Entry point: routes to the dashboard or the login screen. */
export default function RootPage() {
  const router = useRouter();
  const status = useAuth((state) => state.status);

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Skeleton className="h-10 w-48" />
    </div>
  );
}
