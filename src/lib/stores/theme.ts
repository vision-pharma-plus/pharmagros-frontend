"use client";

/**
 * Colour theme.
 *
 * A full dark palette already existed in globals.css but nothing ever applied
 * the `dark` class, so it was unreachable. This store applies it and persists
 * the choice; "system" follows the OS preference and keeps following it.
 */

import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "pharmagros.theme";

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
};

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Applies the stored preference and starts following the OS in "system". */
  init: () => () => void;
}

export const useTheme = create<ThemeStore>((set, get) => ({
  theme: "system",

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing can refuse storage; the theme still applies for the
      // rest of the session.
    }
  },

  init: () => {
    let stored: Theme = "system";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {
      // Fall back to following the system preference.
    }

    set({ theme: stored });
    applyTheme(stored);

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (get().theme === "system") applyTheme("system");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  },
}));
