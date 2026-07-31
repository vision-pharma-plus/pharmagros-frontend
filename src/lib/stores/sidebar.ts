"use client";

/**
 * Desktop sidebar collapse state.
 *
 * Collapsing is a workspace preference rather than a per-page one: someone who
 * wants the extra horizontal room on a wide stock table wants it on the next
 * screen too, so the choice persists across navigation and reloads.
 *
 * Only the desktop rail reads this. The mobile drawer is always full width —
 * an icon-only rail on a phone would just be a worse version of the drawer.
 */

import { create } from "zustand";

const STORAGE_KEY = "pharmagros.sidebar-collapsed";

interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
  /** Reads the stored preference. Call from an effect so SSR stays neutral. */
  init: () => void;
}

const persist = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Private browsing can refuse storage; the choice still holds for the
    // rest of the session.
  }
};

export const useSidebar = create<SidebarStore>((set, get) => ({
  // Starts expanded so the server render and the first client render agree;
  // `init` applies the stored preference immediately afterwards.
  collapsed: false,

  toggle: () => {
    const collapsed = !get().collapsed;
    set({ collapsed });
    persist(collapsed);
  },

  init: () => {
    try {
      set({ collapsed: window.localStorage.getItem(STORAGE_KEY) === "1" });
    } catch {
      // Fall back to expanded.
    }
  },
}));
