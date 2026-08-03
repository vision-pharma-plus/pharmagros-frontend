"use client";

/**
 * Last-resort boundary, for a throw in the root layout or the providers.
 *
 * A route-level `error.tsx` sits *inside* the root layout, so it cannot catch
 * a failure in the layout itself — that case bypasses it entirely and falls
 * through to the browser as a blank page. This replaces the whole document,
 * which is why it renders its own <html> and <body> and why it cannot rely on
 * the locale provider, the theme or any app styling: none of them are
 * guaranteed to have mounted at the point it takes over.
 *
 * Both languages are shown rather than picking one, since the provider that
 * knows the user's locale is exactly what may have failed here.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Une erreur est survenue
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 0.25rem" }}>
            Rechargez la page. Si le problème persiste, contactez le support.
          </p>
          <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 1.25rem" }}>
            Reload the page. If the problem persists, contact support.
          </p>

          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#64748b",
                margin: "0 0 1.25rem",
              }}
            >
              {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              borderRadius: "0.375rem",
              border: "1px solid #cbd5e1",
              background: "#0f172a",
              color: "#ffffff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
            }}
          >
            Réessayer / Retry
          </button>
        </div>
      </body>
    </html>
  );
}
