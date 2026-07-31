"use client";

import { Segmented } from "@/components/ui/segmented";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

const LABELS: Record<Locale, string> = { fr: "FR", en: "EN" };
const NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

/**
 * Language toggle.
 *
 * Switching is immediate — the UI re-renders and the API client starts sending
 * the new `X-Language` header on the next request. When a user is signed in,
 * the preference is also persisted server-side so it survives to the next
 * session and applies to generated PDFs and emails.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const user = useAuth((state) => state.user);
  const setLanguage = useAuth((state) => state.setLanguage);

  const handleSelect = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    if (user) void setLanguage(next);
  };

  return (
    <Segmented
      ariaLabel="Language"
      className={className}
      value={locale}
      onChange={handleSelect}
      options={LOCALES.map((code) => ({
        value: code,
        // The endonym is the accessible name — "FR" alone is opaque read aloud.
        label: NAMES[code],
        content: LABELS[code],
      }))}
    />
  );
}
