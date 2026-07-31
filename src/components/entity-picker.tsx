"use client";

import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { QuickCreateDialog } from "@/components/quick-create-dialog";
import { Input } from "@/components/ui/primitives";
import { api, type Paginated } from "@/lib/api/client";
import { useDebounced } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import {
  getResource,
  type QuickCreateResourceKey,
} from "@/lib/quick-create/resources";
import { useAuth } from "@/lib/stores/auth";
import { cn } from "@/lib/utils";

interface EntityPickerProps<T> {
  /** API path to search, e.g. "/catalog/medicines/". */
  path: string;
  value: T | null;
  onChange: (value: T | null) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string;
  placeholder?: string;
  disabled?: boolean;
  /** Extra query parameters applied to every search. */
  params?: Record<string, string | number | boolean | undefined>;
  /** Set on the trigger so a `Field` label can point at it. */
  id?: string;
  /**
   * Enables inline creation from the dropdown. The search text is carried into
   * the dialog, so a fruitless search for a new customer becomes the first
   * field of the form that creates them.
   */
  createResource?: QuickCreateResourceKey;
}

/**
 * Searchable entity selector.
 *
 * Server-side search rather than loading everything into a `<select>`: a
 * wholesaler's catalogue runs to thousands of products, and shipping that to
 * the browser on every page load would be slow and immediately stale.
 *
 * This is the control used to pick a customer and every product on a sale, so
 * it is fully keyboard-operable: arrows move the active option, Enter selects,
 * Escape closes, and the selection can be cleared without a mouse.
 */
export function EntityPicker<T>({
  path,
  value,
  onChange,
  getKey,
  getLabel,
  getSublabel,
  placeholder,
  disabled = false,
  params,
  id,
  createResource,
}: EntityPickerProps<T>) {
  const t = useTranslation();
  const can = useAuth((state) => state.can);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  /** Frozen at the moment the dialog opens, since closing clears the search. */
  const [createSeed, setCreateSeed] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const resource = createResource ? getResource(createResource) : null;
  const canCreate = resource !== null && !disabled && can(resource.permission);

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const debouncedSearch = useDebounced(search, 300);

  // Close on outside click. Suspended while the quick-create dialog is open:
  // that dialog renders in a portal outside this container, so every click
  // inside it would otherwise read as "outside" and close the picker beneath.
  useEffect(() => {
    if (!open || createOpen) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, createOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    api
      .get<Paginated<T>>(path, {
        search: debouncedSearch || undefined,
        page_size: 20,
        ...params,
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data.results);
          // Reset the highlight whenever the result set changes, so Enter
          // never selects a row left over from the previous query.
          setActiveIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedSearch, path, JSON.stringify(params)]);

  // Keep the highlighted option within the scrolling list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open, items.length]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    setSearch("");
    if (restoreFocus) triggerRef.current?.focus();
  };

  const select = (item: T) => {
    onChange(item);
    close();
  };

  const clear = () => {
    onChange(null);
    triggerRef.current?.focus();
  };

  /** Shared by the trigger and the search box so both drive the list. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((current) =>
          items.length === 0 ? 0 : (current + 1) % items.length,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((current) =>
          items.length === 0 ? 0 : (current - 1 + items.length) % items.length,
        );
        break;
      case "Home":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        if (!open) return;
        event.preventDefault();
        setActiveIndex(Math.max(0, items.length - 1));
        break;
      case "Enter": {
        if (!open) {
          event.preventDefault();
          setOpen(true);
          return;
        }
        const item = items[activeIndex];
        if (item) {
          // Never let Enter reach the surrounding form: on the sale screen
          // that would submit a half-built order.
          event.preventDefault();
          select(item);
        }
        break;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      case "Tab":
        if (open) close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <button
          id={id}
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={onKeyDown}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
        >
          <span className="truncate">
            {value ? getLabel(value) : (placeholder ?? t.common.search)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>

        {/* Without this a mis-picked customer could not be undone at all. */}
        {value && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label={t.common.clear}
            className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.common.search}
              className="h-9 pl-8"
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                items.length > 0 ? optionId(activeIndex) : undefined
              }
            />
          </div>

          <ul
            id={listboxId}
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {loading ? (
              <li className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.common.loading}
              </li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t.common.noResults}
              </li>
            ) : (
              items.map((item, index) => {
                const selected = value !== null && getKey(value) === getKey(item);
                const active = index === activeIndex;
                return (
                  <li
                    key={getKey(item)}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(item)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left text-sm",
                      active && "bg-accent",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {getLabel(item)}
                      </span>
                      {getSublabel && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {getSublabel(item)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          {/* Placed after the results rather than above them: it is the
              fallback when nothing matched, not the primary action. */}
          {canCreate && (
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => {
                  setCreateSeed(search);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {search.trim()
                    ? `${resource!.triggerLabel(t)}: “${search.trim()}”`
                    : resource!.triggerLabel(t)}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {resource && canCreate && (
        <QuickCreateDialog
          resource={resource}
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialLabel={createSeed}
          onCreated={(record) => {
            // The record comes back from the create endpoint in the same shape
            // the list endpoint returns, so it can be selected directly — no
            // second round trip, and no flash of an unselected field.
            onChange(record as unknown as T);
            setCreateOpen(false);
            close();
          }}
        />
      )}
    </div>
  );
}
