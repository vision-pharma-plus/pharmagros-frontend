"use client";

/**
 * Unread notification count.
 *
 * Held in a store rather than local state in the app shell so that reading a
 * notification updates the header badge immediately. Previously the badge only
 * refreshed on a 60-second poll, so a user who had just cleared their alerts
 * kept seeing a count for items they had already dealt with.
 */

import { create } from "zustand";

import { api } from "@/lib/api/client";

interface UnreadStore {
  unread: number;
  refresh: () => Promise<void>;
}

export const useUnread = create<UnreadStore>((set) => ({
  unread: 0,
  refresh: async () => {
    try {
      const data = await api.get<{ unread: number }>(
        "/notifications/notifications/unread-count/",
      );
      set({ unread: data.unread });
    } catch {
      // A failed badge poll must never disrupt the session.
    }
  },
}));
