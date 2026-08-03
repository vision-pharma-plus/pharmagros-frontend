"use client";

/**
 * Error boundary for every authenticated route.
 *
 * Without a boundary here, a single render-time throw anywhere in a page
 * unmounts the entire React tree and Next.js replaces the app with its bare
 * "Application error: a client-side exception has occurred" text on a white
 * page. That is what a save followed by a blank screen looked like: the record
 * had already been written server-side, so the data was fine, but the operator
 * had no way to tell a completed save from a lost one and no way back except
 * reloading the browser.
 *
 * Scoped to the (app) segment so the shell — sidebar, topbar, navigation —
 * stays mounted and usable. `reset()` re-renders the failed segment only,
 * which recovers from a transient render fault without a full page load.
 */

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { useTranslation } from "@/lib/i18n/provider";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslation();

  useEffect(() => {
    // The message is minified in production, so the digest is what ties a
    // report from the counter back to a specific build's stack trace.
    console.error("Unhandled render error", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {t.errors.internal_error}
      </Alert>

      {/* Surfaced deliberately: it is the only stable identifier a user can
          read out, since the underlying message is minified in production. */}
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          {error.digest}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          {t.common.retry}
        </Button>
      </div>
    </div>
  );
}
