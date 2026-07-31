"use client";

/**
 * Inline creation of a reference record, from inside the form that needs it.
 *
 * Rendered in a modal so the calling form stays mounted: nothing the user has
 * typed is unmounted, re-fetched or re-initialised while this is open, which
 * is the whole point — the previous route-away-and-come-back flow lost it.
 *
 * The dialog is driven entirely by the resource registry, so every dependency
 * behaves the same way: same required-field rules, same duplicate handling,
 * same server-error mapping onto the offending field.
 */

import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import { translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import {
  buildPayload,
  initialValues,
  missingRequired,
  type QuickCreateField,
  type QuickCreateResource,
  type ReferenceRecord,
} from "@/lib/quick-create/resources";
import { useAuth } from "@/lib/stores/auth";

interface QuickCreateDialogProps {
  resource: QuickCreateResource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called with the created — or matched existing — record. The caller selects
   * it and refreshes its own option list.
   */
  onCreated: (record: ReferenceRecord) => void;
  /** Seeds the first text field, e.g. from what the user typed into a search. */
  initialLabel?: string;
}

export function QuickCreateDialog({
  resource,
  open,
  onOpenChange,
  onCreated,
  initialLabel,
}: QuickCreateDialogProps) {
  const t = useTranslation();
  const can = useAuth((state) => state.can);

  const [values, setValues] = useState(() => initialValues(resource));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  /** An existing record whose unique field collides with what was typed. */
  const [duplicate, setDuplicate] = useState<ReferenceRecord | null>(null);
  const [touched, setTouched] = useState(false);
  const [options, setOptions] = useState<Record<string, ReferenceRecord[]>>({});

  const allowed = can(resource.permission);

  // The dialog is mounted for the lifetime of the parent form, so state has to
  // be reset on open rather than on mount — otherwise a second use would still
  // show the first record's values and errors.
  const firstNameField = resource.fields.find(
    (field) => field.kind === "text" && field.name !== "code",
  );
  const seededRef = useRef(false);

  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;

    const seeded = initialValues(resource);
    const trimmed = initialLabel?.trim();
    if (trimmed && firstNameField) seeded[firstNameField.name] = trimmed;

    setValues(seeded);
    setFieldErrors({});
    setError(null);
    setDuplicate(null);
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Options for nested reference fields (a parent category, a base unit).
  const referenceFields = useMemo(
    () => resource.fields.filter((field) => field.kind === "reference"),
    [resource],
  );

  useEffect(() => {
    if (!open || referenceFields.length === 0) return;
    let cancelled = false;

    Promise.all(
      referenceFields.map(async (field) => {
        if (!field.optionsPath) return [field.name, [] as ReferenceRecord[]] as const;
        try {
          const data = await api.get<Paginated<ReferenceRecord>>(
            field.optionsPath,
            { page_size: 200 },
          );
          return [field.name, data.results] as const;
        } catch {
          // A failed option list must not block creation — the field is
          // optional in every resource that has one.
          return [field.name, [] as ReferenceRecord[]] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setOptions(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [open, referenceFields]);

  const setValue = (name: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [name]: value }));
    // Clear the error the moment the user addresses it, rather than making
    // them submit again to find out whether the fix worked.
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (duplicate) setDuplicate(null);
  };

  const missing = missingRequired(resource, values);
  const canSubmit = allowed && missing.length === 0 && !saving;

  /**
   * Look for an existing record before creating one.
   *
   * Two users adding "Antibiotiques" from two different product forms is the
   * ordinary case, not an edge case. Rather than let the second one hit a
   * unique-constraint 400 and lose the dialog contents, offer the record that
   * is already there — selecting it is what they actually wanted.
   */
  const findDuplicate = async (): Promise<ReferenceRecord | null> => {
    const uniqueFields = resource.uniqueFields ?? [];
    for (const name of uniqueFields) {
      const raw = values[name];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) continue;
      try {
        const data = await api.get<Paginated<ReferenceRecord>>(resource.path, {
          search: value,
          page_size: 20,
        });
        const match = data.results.find(
          (item) =>
            String(item[name] ?? "").toLowerCase() === value.toLowerCase(),
        );
        if (match) return match;
      } catch {
        // Search is an optimisation; if it fails let the POST decide.
      }
    }
    return null;
  };

  const submit = async () => {
    setTouched(true);
    if (missing.length > 0) {
      setFieldErrors(
        Object.fromEntries(
          missing.map((name) => [name, t.validation.fieldRequired]),
        ),
      );
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const existing = await findDuplicate();
      if (existing) {
        setDuplicate(existing);
        return;
      }

      const created = await api.post<ReferenceRecord>(
        resource.path,
        buildPayload(resource, values),
      );

      toast.success(t.toasts.created, resource.getLabel(created));
      onCreated(created);
      onOpenChange(false);
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) });

      // Map server-side field errors onto their inputs. Without this a
      // duplicate code reads as a generic banner and the user has to guess
      // which of six fields the server objected to.
      const mapped: Record<string, string> = {};
      for (const [field, messages] of Object.entries(apiError.fieldErrors)) {
        mapped[field] = messages.join(" ");
      }
      setFieldErrors(mapped);
      setError(Object.keys(mapped).length > 0 ? null : apiError);
    } finally {
      setSaving(false);
    }
  };

  const useExisting = () => {
    if (!duplicate) return;
    onCreated(duplicate);
    onOpenChange(false);
  };

  const renderField = (field: QuickCreateField) => {
    const value = values[field.name];
    const message = fieldErrors[field.name];
    const label = field.label(t);
    const placeholder = field.placeholder?.(t);

    const common = {
      "data-quick-create-field": field.name,
      disabled: saving,
    };

    let control: React.ReactNode;

    switch (field.kind) {
      case "checkbox":
        return (
          <label
            key={field.name}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={Boolean(value)}
              disabled={saving}
              onChange={(event) => setValue(field.name, event.target.checked)}
            />
            {label}
          </label>
        );

      case "textarea":
        control = (
          <Textarea
            {...common}
            rows={2}
            value={String(value ?? "")}
            placeholder={placeholder}
            onChange={(event) => setValue(field.name, event.target.value)}
          />
        );
        break;

      case "select":
        control = (
          <Select
            {...common}
            value={String(value ?? "")}
            onChange={(event) => setValue(field.name, event.target.value)}
          >
            {Object.entries(field.choices?.(t) ?? {}).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </Select>
        );
        break;

      case "reference":
        control = (
          <Select
            {...common}
            value={String(value ?? "")}
            onChange={(event) => setValue(field.name, event.target.value)}
          >
            <option value="">
              {field.emptyLabel?.(t) ?? t.common.none}
            </option>
            {(options[field.name] ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {field.optionLabel?.(item) ?? item.id}
              </option>
            ))}
          </Select>
        );
        break;

      case "number":
        control = (
          <Input
            {...common}
            type="number"
            inputMode="decimal"
            min={field.min}
            step={field.step}
            value={String(value ?? "")}
            placeholder={placeholder}
            onChange={(event) => setValue(field.name, event.target.value)}
          />
        );
        break;

      default:
        control = (
          <Input
            {...common}
            type={
              field.kind === "email"
                ? "email"
                : field.kind === "url"
                  ? "url"
                  : field.kind === "tel"
                    ? "tel"
                    : "text"
            }
            value={String(value ?? "")}
            placeholder={placeholder}
            className={field.uppercase ? "font-mono uppercase" : undefined}
            onChange={(event) =>
              setValue(
                field.name,
                field.uppercase
                  ? event.target.value.toUpperCase()
                  : event.target.value,
              )
            }
          />
        );
    }

    return (
      <Field
        key={field.name}
        label={label}
        required={field.required}
        error={touched ? message : undefined}
        hint={field.hint?.(t)}
      >
        {control}
      </Field>
    );
  };

  const bannerMessage = translateError(error, t);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Keeps Enter and Escape inside the dialog: both would otherwise reach
          the form underneath and submit or cancel a half-built record. */}
      <DialogContent
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const target = event.target as HTMLElement;
            if (target.tagName !== "TEXTAREA") {
              event.preventDefault();
              if (canSubmit) void submit();
            }
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{resource.title(t)}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!allowed && (
            <Alert variant="warning">{t.errors.permission_denied}</Alert>
          )}

          {bannerMessage && (
            <Alert variant="destructive" title={t.common.errorOccurred}>
              {bannerMessage}
            </Alert>
          )}

          {duplicate && (
            <Alert variant="warning" title={t.quickCreate.duplicateTitle}>
              <p className="mb-2">
                {t.quickCreate.duplicateBody} —{" "}
                <span className="font-medium">
                  {resource.getLabel(duplicate)}
                </span>
              </p>
              <Button size="sm" variant="outline" onClick={useExisting}>
                {t.quickCreate.useExisting}
              </Button>
            </Alert>
          )}

          <fieldset disabled={!allowed} className="space-y-4">
            {resource.fields.map(renderField)}
          </fieldset>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t.common.cancel}
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!canSubmit}>
            {t.quickCreate.createAndSelect}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small inline warning used where a dependency list is empty. */
export function MissingDependencyHint({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
