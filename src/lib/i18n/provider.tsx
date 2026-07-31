"use client";

/**
 * Locale context.
 *
 * The switch is live: changing the locale re-renders the tree immediately and
 * updates the `X-Language` header the API client sends, so server-generated
 * messages follow without a logout. The requirement is explicit about this —
 * forcing a re-login to change language would be a poor fit for a shared
 * warehouse terminal where staff alternate between French and English.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LOCALE,
  dictionaries,
  type Dictionary,
  type Locale,
} from "./dictionaries";

const STORAGE_KEY = "pharmagros.locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Read the persisted preference after mount rather than during render:
  // touching localStorage on the server would break hydration.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, t: dictionaries[locale] }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}

/** Convenience hook for the common case of only needing the dictionary. */
export function useTranslation(): Dictionary {
  return useLocale().t;
}

/**
 * Picks the field matching the active locale from a record the API returns in
 * both languages (roles, categories, permissions...).
 *
 * Those records also carry a server-resolved `name`, but it is fixed at the
 * moment the request was made. The locale switch is live and does not refetch,
 * so reading `name` would leave the previous language on screen until the next
 * load. Choosing client-side keeps the label in step with the switcher.
 */
export function useLocalizedName(
  record: { name_fr: string; name_en: string } | null | undefined,
): string {
  const { locale } = useLocale();
  if (!record) return "";
  return locale === "en" ? record.name_en : record.name_fr;
}

/** Non-hook form, for use inside `.map()` over a list of such records. */
export function localizedName(
  record: { name_fr: string; name_en: string },
  locale: Locale,
): string {
  return locale === "en" ? record.name_en : record.name_fr;
}

/** Reads the persisted locale outside React, for the API client's header. */
export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "fr" || stored === "en" ? stored : DEFAULT_LOCALE;
}
