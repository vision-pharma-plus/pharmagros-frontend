"use client";

/**
 * Authentication and permission state.
 *
 * The permission list is used for UI affordances only — hiding a button the
 * user cannot action. Every one of those actions is independently enforced
 * server-side by `HasPermission`, because a hidden button is not a security
 * control. Treating this store as authorisation would be a serious mistake.
 */

import { create } from "zustand";

import { api, ApiError, setSessionExpiredHandler, tokens } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

interface AuthState {
  user: User | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  error: string | null;

  /**
   * Set when an administrator has forced a password change.
   *
   * The credentials are valid and the tokens are real, so the session is
   * genuinely authenticated — but every screen has to funnel the user to
   * `/change-password` until this clears, because the backend rejects the
   * rest of the API until the password is changed.
   */
  mustChangePassword: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setLanguage: (language: "fr" | "en") => Promise<void>;
  clearError: () => void;

  /** UI gating helpers — never a substitute for server-side checks. */
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,
  mustChangePassword: false,

  login: async (email, password) => {
    set({ status: "loading", error: null });
    try {
      const data = await api.login(email, password);
      tokens.set(data.access, data.refresh);
      set({
        user: data.user as User,
        status: "authenticated",
        error: null,
        mustChangePassword: Boolean(data.must_change_password),
      });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "unknown_error";
      set({ status: "unauthenticated", error: code, user: null });
      throw error;
    }
  },

  logout: async () => {
    const refresh = tokens.getRefresh();
    try {
      // Best effort: blacklist server-side so the refresh token dies with the
      // session. A failure here must not prevent local sign-out.
      if (refresh) await api.post("/auth/logout/", { refresh });
    } catch {
      // ignored
    } finally {
      tokens.clear();
      set({
        user: null,
        status: "unauthenticated",
        error: null,
        mustChangePassword: false,
      });
    }
  },

  loadSession: async () => {
    if (!tokens.getAccess()) {
      set({ status: "unauthenticated", user: null });
      return;
    }
    set({ status: "loading" });
    try {
      const user = await api.get<User>("/auth/me/");
      // Restored from the user record rather than remembered client-side, so
      // reloading the page cannot skip a forced password change.
      set({
        user,
        status: "authenticated",
        mustChangePassword: Boolean(user.must_change_password),
      });
    } catch {
      tokens.clear();
      set({ user: null, status: "unauthenticated" });
    }
  },

  setLanguage: async (language) => {
    const user = get().user;
    if (!user) return;
    // Optimistic: the switch must feel instant. The server call only persists
    // the preference for the next session and for server-rendered documents.
    set({ user: { ...user, language } });
    try {
      await api.post("/auth/language/", { language });
    } catch {
      // A failed persist is not worth surfacing; the UI language already changed.
    }
  },

  clearError: () => set({ error: null }),

  can: (permission) => {
    const user = get().user;
    if (!user) return false;
    return user.permissions.includes(permission);
  },

  canAny: (...permissions) => {
    const user = get().user;
    if (!user) return false;
    return permissions.some((p) => user.permissions.includes(p));
  },
}));

/**
 * Wire the API client's session-expiry hook into the store.
 *
 * Called once from the root provider. Without it, a refresh failure would
 * clear tokens but leave the UI believing it is still authenticated.
 */
export function initAuthBridge(): void {
  setSessionExpiredHandler(() => {
    // Tokens are already cleared by the client at this point; this is what
    // moves the UI off an authenticated screen it can no longer serve.
    useAuth.setState({
      user: null,
      status: "unauthenticated",
      mustChangePassword: false,
    });
  });
}
