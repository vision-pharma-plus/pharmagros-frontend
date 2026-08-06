"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/stores/auth";

/**
 * Layout for every authenticated route.
 *
 * The redirect here is a routing convenience, not a security boundary — the
 * API rejects unauthenticated requests regardless of what the client renders.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const status = useAuth((state) => state.status);
  const mustChangePassword = useAuth((state) => state.mustChangePassword);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    // Catches the user who reaches an app URL directly while flagged — the
    // backend would reject every request this shell makes.
    if (status === "authenticated" && mustChangePassword) {
      router.replace("/change-password");
    }
  }, [status, mustChangePassword, router]);

  if (status !== "authenticated" || mustChangePassword) {
    // The shell silhouette rather than a centred card: the sidebar, the
    // topbar and the content well all land in place, so authenticating does
    // not rebuild the page around the user.
    return (
      <div className="flex min-h-screen bg-muted/20">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="min-h-0 flex-1 space-y-6 px-3 py-4">
            {Array.from({ length: 4 }).map((_, section) => (
              <div key={section}>
                <Skeleton className="mx-2.5 mb-2 h-3 w-20" />
                <div className="space-y-0.5">
                  {Array.from({ length: 4 }).map((_, item) => (
                    <Skeleton key={item} className="h-9 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t border-border p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 lg:px-6">
            <Skeleton className="h-4 w-40" />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-9 w-9" />
            </div>
          </header>
          <main className="min-w-0 flex-1 space-y-5 p-4 lg:p-6">
            <Skeleton className="h-8 w-56" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-[104px]" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
