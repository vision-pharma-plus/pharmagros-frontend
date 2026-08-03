/**
 * Typed API client.
 *
 * Two behaviours worth noting:
 *
 *   * Access tokens live 15 minutes, so a 401 mid-session is normal rather
 *     than exceptional. The client transparently refreshes and replays the
 *     request once. Concurrent 401s share a single in-flight refresh — without
 *     that, a dashboard firing six parallel requests would trigger six
 *     refreshes, and because the backend rotates and blacklists refresh
 *     tokens, five of them would be invalidated and log the user out.
 *
 *   * Errors always arrive in the backend's `{error: {code, message, details}}`
 *     envelope, so they are normalised into a typed `ApiError` that carries
 *     the machine code. Screens branch on `code`, never on message text.
 */

import { getStoredLocale } from "@/lib/i18n/provider";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const ACCESS_TOKEN_KEY = "pharmagros.access";
const REFRESH_TOKEN_KEY = "pharmagros.refresh";

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code;
    this.details = payload.details ?? {};
  }

  /** Field-level validation errors, for wiring into react-hook-form. */
  get fieldErrors(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(this.details)) {
      if (Array.isArray(value)) {
        result[key] = value.map(String);
      } else if (typeof value === "string") {
        result[key] = [value];
      }
    }
    return result;
  }
}

export interface Paginated<T> {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export const tokens = {
  getAccess: () =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (access: string, refresh?: string) => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
    if (refresh) window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear: () => {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

// ---------------------------------------------------------------------------
// Refresh coordination
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string | null> | null = null;

/** Callbacks fired when the session is unrecoverable, so the app can redirect. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler) {
  onSessionExpired = handler;
}

async function refreshAccessToken(): Promise<string | null> {
  // Share one in-flight refresh across all callers.
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refresh = tokens.getRefresh();
    if (!refresh) return null;

    try {
      const response = await fetch(`${API_URL}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        access: string;
        refresh?: string;
      };
      // The backend rotates refresh tokens, so store the new one when present.
      tokens.set(data.access, data.refresh);
      return data.access;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Set for endpoints that return a file rather than JSON. */
  raw?: boolean;
  skipAuth?: boolean;
}

function buildUrl(
  path: string,
  params?: RequestOptions["params"],
): string {
  const url = new URL(
    `${API_URL}${path.startsWith("/") ? path : `/${path}`}`,
  );
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { error?: ApiErrorPayload };
    if (data.error) return new ApiError(response.status, data.error);
    return new ApiError(response.status, {
      code: "unknown_error",
      message: response.statusText || "Request failed",
      details: data as Record<string, unknown>,
    });
  } catch {
    return new ApiError(response.status, {
      code: response.status === 0 ? "network_error" : "unknown_error",
      message: response.statusText || "Request failed",
    });
  }
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const { method = "GET", body, params, raw = false, skipAuth = false } = options;

  const headers: Record<string, string> = {
    // Tells the backend which language to render server-side messages in,
    // so validation errors and PDFs follow the user's live selection.
    "X-Language": getStoredLocale(),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (!skipAuth) {
    const access = tokens.getAccess();
    if (access) headers.Authorization = `Bearer ${access}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, {
      code: "network_error",
      message: "Cannot reach the server.",
    });
  }

  // Refresh and replay exactly once, so a genuinely dead session cannot loop.
  if (response.status === 401 && !skipAuth && !isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, options, true);
    }
    tokens.clear();
    onSessionExpired?.();
    throw new ApiError(401, {
      code: "session_expired",
      message: "Your session has expired.",
    });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  return cleanEmDashes(parsed) as T;
}

function cleanEmDashes(val: any): any {
  if (typeof val === "string") {
    return val.replace(/[\u2014\u2013]/g, "-");
  }
  if (Array.isArray(val)) {
    return val.map(cleanEmDashes);
  }
  if (val && typeof val === "object") {
    const res: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      res[key] = cleanEmDashes(val[key]);
    }
    return res;
  }
  return val;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions["params"]) =>
    request<T>(path, { method: "GET", params }),

  post: <T>(path: string, body?: unknown, params?: RequestOptions["params"]) =>
    request<T>(path, { method: "POST", body, params }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  /** For PDF and spreadsheet downloads. */
  download: async (
    path: string,
    params?: RequestOptions["params"],
  ): Promise<Blob> => {
    const response = await request<Response>(
      path,
      { method: "GET", params, raw: true },
    );
    return response.blob();
  },

  /** Login is the one call that must not carry a stale bearer token. */
  login: (email: string, password: string) =>
    request<{
      access: string;
      refresh: string;
      user: unknown;
      must_change_password: boolean;
    }>("/auth/login/", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    }),
};

/** Triggers a browser download for a returned blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Sends a returned blob straight to the printer dialog.
 *
 * A hidden iframe rather than a popup window: the counter browsers block
 * `window.open` on anything that is not a direct click handler, and an
 * awaited download means the print call no longer counts as one. The frame
 * stays in the document until the dialog closes — removing it earlier
 * cancels the job in Chrome, which is what makes a receipt silently not
 * come out.
 */
export function printBlob(blob: Blob): void {
  const url = window.URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;

  const cleanup = () => {
    // Guard against a double call: `afterprint` fires on some browsers and
    // the timeout covers the ones where it never does.
    if (!frame.isConnected) return;
    frame.remove();
    window.URL.revokeObjectURL(url);
  };

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      cleanup();
      return;
    }
    view.addEventListener("afterprint", cleanup);
    view.focus();
    view.print();
    // Fallback for browsers that never fire `afterprint` (older WebKit), so
    // the object URL is not leaked for the life of the tab.
    window.setTimeout(cleanup, 60_000);
  };

  document.body.appendChild(frame);
}
