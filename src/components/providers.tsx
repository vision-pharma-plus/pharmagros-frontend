"use client";

import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/toast";
import { LocaleProvider } from "@/lib/i18n/provider";
import { initAuthBridge, useAuth } from "@/lib/stores/auth";
import { useTheme } from "@/lib/stores/theme";

export function Providers({ children }: { children: ReactNode }) {
  const loadSession = useAuth((state) => state.loadSession);
  const initTheme = useTheme((state) => state.init);

  useEffect(() => {
    // Connect the API client's session-expiry hook to the store before any
    // request can fire, then restore the session from the stored token.
    initAuthBridge();
    void loadSession();
  }, [loadSession]);

  useEffect(() => initTheme(), [initTheme]);

  return (
    <LocaleProvider>
      {children}
      <Toaster />
    </LocaleProvider>
  );
}
