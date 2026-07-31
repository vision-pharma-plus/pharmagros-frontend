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
import {
  Alert,
  Badge,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { Category } from "@/lib/api/types";
import {
  translateError,
  useDebounced,
  usePaginatedQuery,
  useQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface FormState {
  code: string;
  name_fr: string;
  name_en: string;
  parent: string;
  description: string;
  is_active: string;
}

const EMPTY: FormState = {
  code: "",
  name_fr: "",
  name_en: "",
  parent: "",
  description: "",
  is_active: "true",
};

/**
 * Categories are a small reference table maintained a few times a year, so
 * they are edited in a dialog on the list rather than across three routes —
 * the round trip to a separate screen is the slower path for this shape of
 * data.
 */
export default function CategoriesPage() {
  const t = useTranslation();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<Category>("/catalog/categories/", {
    search: debouncedSearch || undefined,
  });
  // Full list for the parent picker: the tree is small, and a search-driven
  // picker would be heavier than the choice warrants.
  const all = useQuery<Paginated<Category>>("/catalog/categories/", {
    page_size: 200,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const canManage = can("catalog.manage_categories");

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };

  const openEdit = (row: Category) => {
    setEditing(row);
    setForm({
      code: row.code,
      name_fr: row.name_fr,
      name_en: row.name_en,
      parent: row.parent ?? "",
      description: row.description,
      is_active: String(row.is_active),
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      code: form.code,
      name_fr: form.name_fr,
      name_en: form.name_en,
      parent: form.parent || null,
      description: form.description,
      is_active: form.is_active === "true",
    };

    try {
      if (editing) {
        await api.patch(`/catalog/categories/${editing.id}/`, payload);
        toast.success(t.toasts.updated, form.code);
      } else {
        await api.post("/catalog/categories/", payload);
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
      await api.delete(`/catalog/categories/${deleting.id}/`);
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

  const columns: Column<Category>[] = [
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
      key: "parent",
      header: t.catalog.parentCategory,
      render: (row) => (
        <span className="text-muted-foreground">{row.parent_name || "—"}</span>
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
            render: (row: Category) => (
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
          } satisfies Column<Category>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.categories}</h1>
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
              {editing ? t.catalog.editCategory : t.catalog.newCategory}
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

            <Field label={`${t.catalog.name} (FR)`} required>
              <Input
                value={form.name_fr}
                onChange={(event) =>
                  setForm({ ...form, name_fr: event.target.value })
                }
              />
            </Field>

            <Field label={`${t.catalog.name} (EN)`} required>
              <Input
                value={form.name_en}
                onChange={(event) =>
                  setForm({ ...form, name_en: event.target.value })
                }
              />
            </Field>

            <Field label={t.catalog.parentCategory}>
              <Select
                value={form.parent}
                onChange={(event) =>
                  setForm({ ...form, parent: event.target.value })
                }
              >
                <option value="">{t.catalog.noParent}</option>
                {(all.data?.results ?? [])
                  // A category cannot be its own parent.
                  .filter((item) => item.id !== editing?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label={t.catalog.description}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
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
              disabled={
                !form.code.trim() ||
                !form.name_fr.trim() ||
                !form.name_en.trim()
              }
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
