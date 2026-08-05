"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, Badge, Field, Input, Select } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { UnitOfMeasure } from "@/lib/api/types";
import {
  translateError,
  useDebounced,
  usePaginatedQuery,
  useQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

// One name, typed in whichever language the user works in: the model keeps a
// French and an English column, but `save()` fills in the side left blank, so
// nobody supplies a translation they do not have.
interface FormState {
  code: string;
  name: string;
  base_unit: string;
  units_per_pack: string;
  is_active: string;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  base_unit: "",
  units_per_pack: "1",
  is_active: "true",
};

/**
 * Units of measure.
 *
 * A unit is mandatory on every product, but until now the only way to add one
 * was the Django admin — so a user setting up the catalogue could be stopped
 * by a required field with nothing to put in it and no screen to fix it on.
 * Managed here in a dialog like the other reference tables.
 */
export default function UnitsPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<UnitOfMeasure>("/catalog/units/", {
    search: debouncedSearch || undefined,
  });
  // Full list for the base-unit picker; the table is small.
  const all = useQuery<Paginated<UnitOfMeasure>>("/catalog/units/", {
    page_size: 200,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UnitOfMeasure | null>(null);
  const [deleting, setDeleting] = useState<UnitOfMeasure | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Units are administered under the same permission as categories, matching
  // `UnitOfMeasureViewSet.required_permissions` on the server.
  const canManage = can("catalog.manage_categories");

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: UnitOfMeasure) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      base_unit: row.base_unit ?? "",
      units_per_pack: String(row.units_per_pack),
      is_active: String(row.is_active),
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    // Send the label under the user's own language; the model translates the
    // other side on save. `name` itself is read-only and resolved per request.
    const suffix = locale === "en" ? "en" : "fr";
    const payload = {
      code: form.code,
      [`name_${suffix}`]: form.name,
      base_unit: form.base_unit || null,
      units_per_pack: form.units_per_pack || "1",
      is_active: form.is_active === "true",
    };

    try {
      if (editing) {
        await api.patch(`/catalog/units/${editing.id}/`, payload);
        toast.success(t.toasts.updated, form.code);
      } else {
        await api.post("/catalog/units/", payload);
        toast.success(t.toasts.created, form.code);
      }
      setOpen(false);
      query.refetch();
      all.refetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/catalog/units/${deleting.id}/`);
      toast.success(t.toasts.deleted, deleting.code);
      setDeleting(null);
      query.refetch();
      all.refetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<UnitOfMeasure>[] = [
    {
      key: "code",
      header: t.catalog.code,
      render: (row) => <span className="font-mono text-xs">{row.code}</span>,
    },
    {
      key: "name",
      header: t.catalog.name,
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "units_per_pack",
      header: t.catalog.unitsPerPack,
      numeric: true,
      render: (row) => (
        <span className="tabular-nums">{row.units_per_pack}</span>
      ),
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? t.catalog.isActive : t.catalog.inactive}
        </Badge>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: t.common.actions,
            render: (row: UnitOfMeasure) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.common.edit}
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.common.delete}
                  onClick={() => {
                    setError(null);
                    setDeleting(row);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ),
          } satisfies Column<UnitOfMeasure>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.units}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.catalog}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t.common.create}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        loading={query.loading}
        error={query.error}
        onRetry={query.refetch}
        search={filters.search}
        onSearchChange={(value) => setFilter("search", value)}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        page={query.page}
        totalPages={query.totalPages}
        count={query.count}
        onPageChange={query.setPage}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t.catalog.editUnit : t.catalog.newUnit}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}

            <Field label={t.catalog.code} required>
              <Input
                className="font-mono uppercase"
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value.toUpperCase() })
                }
              />
            </Field>

            <Field label={t.catalog.name} required>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>

            <Field label={t.catalog.baseUnit} hint={t.catalog.baseUnitHint}>
              <Select
                value={form.base_unit}
                onChange={(event) =>
                  setForm({ ...form, base_unit: event.target.value })
                }
              >
                <option value="">{t.common.none}</option>
                {(all.data?.results ?? [])
                  // A unit cannot be its own base.
                  .filter((item) => item.id !== editing?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} - {item.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label={t.catalog.unitsPerPack}>
              <Input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={form.units_per_pack}
                onChange={(event) =>
                  setForm({ ...form, units_per_pack: event.target.value })
                }
              />
            </Field>

            <Field label={t.common.status}>
              <Select
                value={form.is_active}
                onChange={(event) =>
                  setForm({ ...form, is_active: event.target.value })
                }
              >
                <option value="true">{t.catalog.isActive}</option>
                <option value="false">{t.catalog.inactive}</option>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={save}
              loading={saving}
              disabled={!form.code.trim() || !form.name.trim()}
            >
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.common.delete}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}
            <p className="text-sm">{deleting?.name}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={remove} loading={saving}>
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
