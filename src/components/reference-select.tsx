"use client";

/**
 * A `<select>` over a reference table, with inline creation attached.
 *
 * This is the control that replaces the bare `<Select>` + `useQuery` pair
 * that every dependent form used to repeat. It owns the option list, so
 * "create a category" and "the category appears in the list, selected" are
 * one action rather than something each screen has to remember to wire up.
 *
 * It is uncontrolled-friendly: `react-hook-form`'s `register()` returns
 * `onChange`/`onBlur`/`name`/`ref`, all of which are forwarded to the real
 * `<select>`, so existing forms keep their validation and their submit
 * payload untouched.
 */

import { Plus } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  MissingDependencyHint,
  QuickCreateDialog,
} from "@/components/quick-create-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/primitives";
import { type Paginated } from "@/lib/api/client";
import { useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import {
  getResource,
  type QuickCreateResourceKey,
  type ReferenceRecord,
} from "@/lib/quick-create/resources";
import { useAuth } from "@/lib/stores/auth";
import { cn } from "@/lib/utils";

export interface ReferenceSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  /** Which reference table this field points at. */
  resource: QuickCreateResourceKey;
  /** Option shown for "no selection". Omit to force a choice. */
  emptyLabel?: string;
  /** Overrides the registry's label function for the option text. */
  getOptionLabel?: (item: ReferenceRecord) => string;
  /** Hides the create affordance regardless of permission. */
  disableCreate?: boolean;
}

/**
 * Resolves once `<option value="id">` exists, or `false` if it never arrives.
 *
 * The refetch that adds the option is a state update, so the option appears
 * some renders later. Polling on animation frames keeps this tied to paint
 * rather than to an arbitrary timeout.
 */
async function waitForOption(
  element: HTMLSelectElement,
  id: string,
  timeoutMs = 3000,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (Array.from(element.options).some((o) => o.value === id)) return true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return false;
}

export const ReferenceSelect = forwardRef<
  HTMLSelectElement,
  ReferenceSelectProps
>(function ReferenceSelect(
  {
    resource: resourceKey,
    emptyLabel,
    getOptionLabel,
    disableCreate = false,
    className,
    onChange,
    disabled,
    ...props
  },
  forwardedRef,
) {
  const t = useTranslation();
  const can = useAuth((state) => state.can);
  const resource = getResource(resourceKey);

  const selectRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(forwardedRef, () => selectRef.current as HTMLSelectElement);

  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery<Paginated<ReferenceRecord>>(
    resource.path,
    resource.listParams ?? { page_size: 200 },
  );
  const items = query.data?.results ?? [];

  const label = getOptionLabel ?? resource.getLabel;
  const canCreate = !disableCreate && can(resource.permission);

  /**
   * Select the new record and tell the surrounding form about it.
   *
   * The DOM value is set directly and a native `change` event dispatched,
   * because the parent may be an uncontrolled `react-hook-form` field: simply
   * calling `onChange` with a synthetic object would update the form state but
   * leave the rendered `<select>` showing its previous value.
   */
  const handleCreated = useCallback(
    async (record: ReferenceRecord) => {
      // The new option has to come from React's own render pass: a node added
      // with appendChild survives the next reconciliation, which listed every
      // quick-created record twice. So refetch, then wait for the option to
      // appear before pointing at it — assigning a value that is not yet an
      // option is a no-op in the DOM.
      query.refetch();

      const element = selectRef.current;
      if (!element) return;

      const appeared = await waitForOption(element, record.id);
      if (!appeared) return;

      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(element, record.id);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.refetch],
  );

  const isEmpty = !query.loading && items.length === 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          {...props}
          ref={selectRef}
          onChange={onChange}
          disabled={disabled}
          className={cn(className)}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {label(item)}
            </option>
          ))}
        </Select>

        {canCreate && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={disabled}
            aria-label={resource.triggerLabel(t)}
            title={resource.triggerLabel(t)}
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* An empty required list is a dead end the user cannot diagnose from a
          blank dropdown, so it says so — and the button beside it is the fix. */}
      {isEmpty && canCreate && (
        <MissingDependencyHint>{t.quickCreate.noneYet}</MissingDependencyHint>
      )}
      {isEmpty && !canCreate && (
        <MissingDependencyHint>
          {t.quickCreate.noneYetNoPermission}
        </MissingDependencyHint>
      )}

      {canCreate && (
        <QuickCreateDialog
          resource={resource}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={(record) => void handleCreated(record)}
        />
      )}
    </div>
  );
});
