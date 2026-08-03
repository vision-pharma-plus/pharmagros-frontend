"use client";

/**
 * Data-fetching hooks.
 *
 * A small purpose-built hook rather than a query library: the screens here
 * need fetch-on-mount, a loading flag, an error and a refetch, and nothing
 * more. Adding TanStack Query would bring caching semantics this application
 * does not currently need — stock figures in particular should not be served
 * from a stale cache.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

export function useQuery<T>(
  path: string | null,
  params?: Record<string, string | number | boolean | undefined | null>,
): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);

  // Serialised params, so the effect re-runs on value change rather than on
  // every render caused by a new object identity.
  const key = params ? JSON.stringify(params) : "";
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    api
      .get<T>(path, params)
      .then((result) => {
        if (!cancelledRef.current) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, { code: "unknown_error", message: String(err) }),
        );
      })
      .finally(() => {
        if (!cancelledRef.current) setLoading(false);
      });

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { data, loading, error, refetch };
}

/** Paginated list query with page state. */
export function usePaginatedQuery<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
) {
  const [page, setPage] = useState(1);
  const query = useQuery<Paginated<T>>(path, { ...params, page });

  // Any filter change must reset to page 1, or the user lands on an empty
  // page 7 of a two-page result set.
  const key = params ? JSON.stringify(params) : "";
  useEffect(() => setPage(1), [key]);

  return {
    ...query,
    items: query.data?.results ?? [],
    count: query.data?.count ?? 0,
    totalPages: query.data?.total_pages ?? 1,
    page,
    setPage,
  };
}

/**
 * Translate an ApiError into a user-facing message.
 *
 * Falls back to the server's own message when the code is unrecognised — the
 * backend already localises its responses via the `X-Language` header, so the
 * fallback is still in the user's language.
 */
/**
 * Filter state kept in the URL query string.
 *
 * List screens previously held search and filters in local state only, so a
 * refresh lost them and no filtered view could be bookmarked or sent to a
 * colleague. Values equal to their default are omitted, keeping clean URLs.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
): {
  filters: T;
  setFilter: (key: keyof T, value: string) => void;
  clearFilters: () => void;
  isFiltered: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultsKey = JSON.stringify(defaults);
  const search = searchParams.toString();

  const filters = useMemo(() => {
    const parsed = JSON.parse(defaultsKey) as T;
    const params = new URLSearchParams(search);
    const result = { ...parsed };
    for (const key of Object.keys(parsed) as (keyof T)[]) {
      const value = params.get(String(key));
      if (value !== null) result[key] = value as T[keyof T];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey, search]);

  const write = useCallback(
    (next: T) => {
      const params = new URLSearchParams(search);
      const base = JSON.parse(defaultsKey) as T;
      for (const key of Object.keys(base) as (keyof T)[]) {
        const value = next[key];
        if (value && value !== base[key]) params.set(String(key), value);
        else params.delete(String(key));
      }
      const query = params.toString();
      // replace, not push: typing in a search box must not fill the history
      // stack with one entry per keystroke.
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [defaultsKey, pathname, router, search],
  );

  const setFilter = useCallback(
    (key: keyof T, value: string) => write({ ...filters, [key]: value }),
    [filters, write],
  );

  const clearFilters = useCallback(
    () => write(JSON.parse(defaultsKey) as T),
    [defaultsKey, write],
  );

  const isFiltered = (Object.keys(defaults) as (keyof T)[]).some(
    (key) => filters[key] !== defaults[key],
  );

  return { filters, setFilter, clearFilters, isFiltered };
}

/**
 * Bring the first invalid field into view after a failed submit.
 *
 * On a form the length of the medicine or customer screens the offending
 * field — and the error banner at the top — can both be off screen, so a
 * rejected submit looks like nothing happened at all.
 */
export function scrollToFirstError(fieldNames: string[]): void {
  if (typeof document === "undefined") return;

  for (const name of fieldNames) {
    const element = document.querySelector<HTMLElement>(`[name="${name}"]`);
    if (!element) continue;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
    return;
  }

  // Nothing matched a control (a server error on a field with no input, say);
  // fall back to the top where the error banner is rendered.
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function translateError(
  error: ApiError | null,
  t: Dictionary,
): string | null {
  if (!error) return null;
  const known = t.errors as Record<string, string | undefined>;
  return known[error.code] ?? error.message ?? t.common.errorOccurred;
}

/**
 * Like `translateError`, but prefers the server's own sentence.
 *
 * Some refusals carry detail the dictionary cannot: which batch expired, whose
 * credit is blocked and why. The server has already translated those through
 * gettext, so the specific message beats the generic one keyed by code. The
 * dictionary remains the fallback for errors raised with a bare code.
 */
export function translateErrorDetailed(
  error: ApiError | null,
  t: Dictionary,
): string | null {
  if (!error) return null;
  const known = t.errors as Record<string, string | undefined>;
  return error.message ?? known[error.code] ?? t.common.errorOccurred;
}

/** Debounce a value — used for search inputs so each keystroke is not a request. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
