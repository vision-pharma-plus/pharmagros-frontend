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
import { ApiError, api } from "@/lib/api/client";
import type { Manufacturer } from "@/lib/api/types";
import {
  translateError,
  useDebounced,
  usePaginatedQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface FormState {
  code: string;
  name: string;
  country: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  is_active: string;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  country: "",
  contact_email: "",
  contact_phone: "",
  website: "",
  is_active: "true",
};

/** Reference data, edited in place — see the note on the categories screen. */
export default function ManufacturersPage() {
  const t = useTranslation();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<Manufacturer>("/catalog/manufacturers/", {
    search: debouncedSearch || undefined,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);
  const [deleting, setDeleting] = useState<Manufacturer | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const canManage = can("catalog.manage_manufacturers");

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: Manufacturer) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      country: row.country,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      website: row.website,
      is_active: String(row.is_active),
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = { ...form, is_active: form.is_active === "true" };

    try {
      if (editing) {
        await api.patch(`/catalog/manufacturers/${editing.id}/`, payload);
        toast.success(t.toasts.updated, form.code);
      } else {
        await api.post("/catalog/manufacturers/", payload);
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
      await api.delete(`/catalog/manufacturers/${deleting.id}/`);
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

  const columns: Column<Manufacturer>[] = [
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
      key: "country",
      header: t.partners.country,
      render: (row) => (
        <span className="text-muted-foreground">{row.country || "—"}</span>
      ),
    },
    {
      key: "contact",
      header: t.catalog.contactEmail,
      render: (row) => (
        <span className="text-muted-foreground">{row.contact_email || "—"}</span>
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
            render: (row: Manufacturer) => (
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
          } satisfies Column<Manufacturer>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.manufacturers}</h1>
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
              {editing ? t.catalog.editManufacturer : t.catalog.newManufacturer}
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

            <Field label={t.partners.country}>
              <Input
                value={form.country}
                onChange={(event) =>
                  setForm({ ...form, country: event.target.value })
                }
              />
            </Field>

            <Field label={t.catalog.contactEmail}>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(event) =>
                  setForm({ ...form, contact_email: event.target.value })
                }
              />
            </Field>

            <Field label={t.catalog.contactPhone}>
              <Input
                value={form.contact_phone}
                onChange={(event) =>
                  setForm({ ...form, contact_phone: event.target.value })
                }
              />
            </Field>

            <Field label={t.catalog.website}>
              <Input
                type="url"
                placeholder="https://"
                value={form.website}
                onChange={(event) =>
                  setForm({ ...form, website: event.target.value })
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
