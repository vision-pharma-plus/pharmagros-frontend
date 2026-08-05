"use client";

import { Pencil, Plus, Snowflake, Trash2 } from "lucide-react";
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
import { ApiError, api } from "@/lib/api/client";
import type { Warehouse } from "@/lib/api/types";
import {
  translateError,
  useDebounced,
  usePaginatedQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface FormState {
  code: string;
  // One name, typed in whichever language the user works in. It is stored as
  // a translated pair, as on categories and units, but `save()` fills in the
  // side left blank — and the serializer's own `name` is read-only, so the
  // payload has to name the language column explicitly.
  name: string;
  address: string;
  city: string;
  is_default: boolean;
  is_cold_chain: boolean;
  is_active: string;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  address: "",
  city: "",
  is_default: false,
  is_cold_chain: false,
  is_active: "true",
};

/** Reference data, edited in place — see the note on the categories screen. */
export default function WarehousesPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<Warehouse>("/inventory/warehouses/", {
    search: debouncedSearch || undefined,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const canManage = can("inventory.manage_warehouse");

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: Warehouse) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      address: row.address,
      city: row.city,
      is_default: row.is_default,
      is_cold_chain: row.is_cold_chain,
      is_active: String(row.is_active),
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const suffix = locale === "en" ? "en" : "fr";
    const payload: Record<string, unknown> = {
      code: form.code,
      [`name_${suffix}`]: form.name,
      address: form.address,
      is_default: form.is_default,
      is_cold_chain: form.is_cold_chain,
      is_active: form.is_active === "true",
    };
    // `city` is non-nullable with a database default, so an empty string is a
    // validation error while an absent key takes the default.
    if (form.city.trim()) payload.city = form.city.trim();

    try {
      if (editing) {
        await api.patch(`/inventory/warehouses/${editing.id}/`, payload);
        toast.success(t.toasts.updated, form.code);
      } else {
        await api.post("/inventory/warehouses/", payload);
        toast.success(t.toasts.created, form.code);
      }
      setOpen(false);
      query.refetch();
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
      await api.delete(`/inventory/warehouses/${deleting.id}/`);
      toast.success(t.toasts.deleted, deleting.code);
      setDeleting(null);
      query.refetch();
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

  const columns: Column<Warehouse>[] = [
    {
      key: "code",
      header: t.inventory.warehouseCode,
      render: (row) => <span className="font-mono text-xs">{row.code}</span>,
    },
    {
      key: "name",
      header: t.catalog.name,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{row.name}</span>
          {/* Cold-chain capability decides where a fridge-line product may be
              stored, so it is flagged on the row. */}
          {row.is_cold_chain && (
            <Snowflake
              className="h-3.5 w-3.5 shrink-0 text-primary"
              aria-label={t.inventory.isColdChain}
            />
          )}
        </div>
      ),
    },
    {
      key: "city",
      header: t.partners.city,
      render: (row) => (
        <span className="text-muted-foreground">{row.city || "—"}</span>
      ),
    },
    {
      key: "default",
      header: t.inventory.isDefault,
      render: (row) =>
        row.is_default ? (
          <Badge>{t.common.yes}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
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
            render: (row: Warehouse) => (
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
          } satisfies Column<Warehouse>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.warehouses}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.inventory}</p>
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
              {editing ? t.inventory.editWarehouse : t.inventory.newWarehouse}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}

            <Field label={t.inventory.warehouseCode} required>
              <Input
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
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

            <Field label={t.partners.address}>
              <Input
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
              />
            </Field>

            <Field label={t.partners.city}>
              <Input
                value={form.city}
                onChange={(event) =>
                  setForm({ ...form, city: event.target.value })
                }
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.is_default}
                onChange={(event) =>
                  setForm({ ...form, is_default: event.target.checked })
                }
              />
              {t.inventory.isDefault}
            </label>
            <p className="text-xs text-muted-foreground">
              {t.inventory.defaultWarehouseHint}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.is_cold_chain}
                onChange={(event) =>
                  setForm({ ...form, is_cold_chain: event.target.checked })
                }
              />
              {t.inventory.isColdChain}
            </label>

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
