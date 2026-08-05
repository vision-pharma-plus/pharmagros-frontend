"use client";

import { useState } from "react";

import { api } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/provider";

interface TranslationResponse {
  translated: string;
  target: Locale;
  engine: string;
  cached: boolean;
}

/**
 * Free text written by a user, with an on-demand translation.
 *
 * Staff write notes, reasons and comments in whichever language they work in,
 * and the colleague reading the record later may not share it. Translating is
 * therefore offered on the *reading* side: nobody has to translate before
 * saving, and the cost is paid only when someone actually needs it.
 *
 * Two rules hold this together, and both are deliberate:
 *
 *  - The original is never replaced. It stays on screen above the translation,
 *    because several of these fields (cancellation reasons, quality notes,
 *    credit overrides) are audit evidence, and the words the writer chose are
 *    the record — not our rendering of them.
 *  - The translation is always labelled as machine-produced. A reader deciding
 *    whether to accept a returned batch needs to know they are reading a
 *    machine's guess at a colleague's note, not the colleague.
 *
 * Nothing here writes back to the server.
 */
export function TranslatableText({
  text,
  className,
  inline = false,
}: {
  text: string | null | undefined;
  className?: string;
  /**
   * Compact layout for table cells and alert banners: the control sits on the
   * same line as the text rather than below it, and the translation replaces
   * the original in place with the source moved to the title attribute.
   * Used where a block-level button underneath would break the row rhythm.
   */
  inline?: boolean;
}) {
  const { locale, t } = useLocale();
  const [translated, setTranslated] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const value = (text ?? "").trim();
  if (!value) return null;

  const handleTranslate = async () => {
    // Already fetched once: toggling back is free and needs no round trip.
    if (translated !== null) {
      setTranslated(null);
      return;
    }

    setPending(true);
    setFailed(false);
    try {
      const response = await api.post<TranslationResponse>("/core/translate/", {
        text: value,
        target: locale,
      });
      setTranslated(response.translated);
    } catch {
      // The server returns 503 when no engine could handle it. Showing the
      // source text as though it were translated would be worse than saying
      // nothing, so the failure is surfaced instead.
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  if (inline) {
    const showing = translated ?? value;
    return (
      <span className={className}>
        {/* The source text stays reachable on hover even while the
            translation is displayed: in a dense table the original must
            never become unrecoverable. */}
        <span title={translated !== null ? value : undefined}>{showing}</span>
        {translated !== null && (
          <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
            ({t.machineTranslation.machineTranslated})
          </span>
        )}
        {failed && (
          <span className="ml-1 text-xs text-amber-700 dark:text-amber-500">
            ({t.machineTranslation.unavailable})
          </span>
        )}
        <button
          type="button"
          onClick={handleTranslate}
          disabled={pending}
          className="ml-2 text-xs font-medium text-sky-700 hover:underline disabled:opacity-60 dark:text-sky-400"
        >
          {pending
            ? t.machineTranslation.translating
            : translated !== null
              ? t.machineTranslation.showOriginal
              : t.machineTranslation.translate}
        </button>
      </span>
    );
  }

  return (
    <div className={className}>
      <p className="whitespace-pre-wrap">{value}</p>

      {translated !== null && (
        <div className="mt-2 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {translated}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t.machineTranslation.machineTranslated} ·{" "}
            {t.machineTranslation.originalIsAuthoritative}
          </p>
        </div>
      )}

      {failed && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
          {t.machineTranslation.unavailable}
        </p>
      )}

      <button
        type="button"
        onClick={handleTranslate}
        disabled={pending}
        className="mt-1 text-xs font-medium text-sky-700 hover:underline disabled:opacity-60 dark:text-sky-400"
      >
        {pending
          ? t.machineTranslation.translating
          : translated !== null
            ? t.machineTranslation.showOriginal
            : t.machineTranslation.translate}
      </button>
    </div>
  );
}
