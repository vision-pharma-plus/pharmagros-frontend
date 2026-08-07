"use client";

/**
 * Toast notifications.
 *
 * Every mutation in this product previously succeeded in silence — a clerk
 * posting a goods receipt could not distinguish "saved" from "navigated away".
 * Toasts are the confirmation channel: transient, non-blocking, and announced
 * to assistive technology.
 */

import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { create } from "zustand";

import { useTranslation } from "@/lib/i18n/provider";
import { cn, localId } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: localId() }],
    })),
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

/**
 * Imperative API usable from event handlers and non-React code alike.
 *
 * Exposed as a plain object rather than a hook so a `catch` block deep inside
 * an async submit handler can report without threading a hook through.
 */
const push = (
  variant: ToastVariant,
  title: string,
  // Accepts null so `translateError(...)` can be passed straight through.
  description?: string | null,
) =>
  useToastStore
    .getState()
    .push({ title, description: description ?? undefined, variant });

export const toast = {
  success: (title: string, description?: string | null) =>
    push("success", title, description),
  error: (title: string, description?: string | null) =>
    push("error", title, description),
  warning: (title: string, description?: string | null) =>
    push("warning", title, description),
  info: (title: string, description?: string | null) =>
    push("info", title, description),
};

const VARIANT_ICON = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
} as const;

const VARIANT_STYLES = {
  success: "border-success/40 bg-card text-foreground",
  error: "border-destructive/40 bg-card text-foreground",
  warning: "border-warning/40 bg-card text-foreground",
  info: "border-border bg-card text-foreground",
} as const;

const VARIANT_ICON_COLOR = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-muted-foreground",
} as const;

export function Toaster() {
  const t = useTranslation();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {/* The viewport is rendered *before* the toasts, and unconditionally.
          Each Toast.Root portals itself into this element, so it has to be
          mounted and registered on the provider first: a Root that renders in
          the same commit as its portal target returns null on that pass and
          then inserts against a container React has not finished placing,
          which surfaces as "insertBefore ... not a child of this node" and
          takes down the whole tree via the error boundary. Keeping the
          viewport first and always mounted makes the target a stable parent
          that outlives every individual toast.

          Positioned bottom-right on desktop, top on mobile where the thumb
          rests low. */}
      <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-auto sm:max-w-sm" />

      {toasts.map((item) => {
        const Icon = VARIANT_ICON[item.variant];
        return (
          <ToastPrimitive.Root
            key={item.id}
            open
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
            // Errors interrupt; everything else is announced politely so a
            // routine "saved" does not cut across what the user is reading.
            type={item.variant === "error" ? "foreground" : "background"}
            className={cn(
              "pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-80",
              "data-[swipe=end]:animate-out data-[swipe=end]:fade-out-80",
              VARIANT_STYLES[item.variant],
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                VARIANT_ICON_COLOR[item.variant],
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold">
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              className="shrink-0 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={t.common.close}
            >
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
    </ToastPrimitive.Provider>
  );
}
