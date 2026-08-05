"use client";

import { Pencil, Plus } from "lucide-react";
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
import { Badge, Field, Input, Alert } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { ExpenseCategory } from "@/lib/api/types";
import { translateErrorDetailed, usePaginatedQuery } from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

// One name, typed in whichever language the operator works in. The model
// stores a French and an English column, but `save()` fills in the side that
// was left blank by machine translation, so nobody types their own label
// twice. Written to the paired columns rather than the resolved `name`,
// which is read-only on the serializer and would save nothing.
const empty = {
  code: "",
  name: "",
  description: "",
  is_active: true,
};

export default function ExpenseCategoriesPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const can = useAuth((state) => state.can);
  const query = usePaginatedQuery<ExpenseCategory>(
    "/accounting/expense-categories/",
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...empty });
    setError(null);
    setOpen(true);
  };

  const startEdit = (category: ExpenseCategory) => {
    setEditing(category);
    setForm({
      code: category.code,
      name: category.name,
      description: category.description,
      is_active: category.is_active,
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // The operator typed one label, in their own language. Send it as that
      // language's column and leave the other blank: the model translates the
      // missing side on save, so the category still reads correctly for staff
      // working in the other language.
      const { name, description, ...rest } = form;
      const suffix = locale === "en" ? "en" : "fr";
      const payload = {
        ...rest,
        [`name_${suffix}`]: name,
        [`description_${suffix}`]: description,
      };
      if (editing) {
        await api.patch(
          `/accounting/expense-categories/${editing.id}/`,
          payload,
        );
        toast.success(t.toasts.updated, name);
      } else {
        await api.post("/accounting/expense-categories/", payload);
        toast.success(t.toasts.created, name);
      }
      setOpen(false);
      query.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ExpenseCategory>[] = [
    {
      key: "code",
      header: t.accounting.categoryCode,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.code}</span>
      ),
    },
    {
      key: "name",
      header: t.accounting.categoryName,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          {row.description && (
            <p className="truncate text-xs text-muted-foreground">
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "usage",
      header: t.accounting.expenses,
      numeric: true,
      render: (row) => row.expense_count,
    },
    {
      key: "active",
      header: t.common.status,
      render: (row) =>
        row.is_active ? (
          <Badge variant="success">{t.status.ACTIVE}</Badge>
        ) : (
          <Badge variant="secondary">{t.status.INACTIVE}</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        can("accounting.manage_expense_categories") ? (
          <Button variant="ghost" size="sm" onClick={() => startEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.accounting.categories}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.accounting}</p>
        </div>
        {can("accounting.manage_expense_categories") && (
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            {t.accounting.newCategory}
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
        page={query.page}
        totalPages={query.totalPages}
        count={query.count}
        onPageChange={query.setPage}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t.common.edit : t.accounting.newCategory}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {error && (
              <Alert variant="destructive">
                {translateErrorDetailed(error, t)}
              </Alert>
            )}
            <Field label={t.accounting.categoryCode} required>
              <Input
                value={form.code}
                // The code is what history is grouped by, so it is fixed once
                // expenses reference it; renaming is done through the label.
                disabled={Boolean(editing)}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field
              label={t.accounting.categoryName}
              required
              hint={t.accounting.otherLanguageHint}
            >
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label={t.accounting.description}>
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </Field>
            <Field label={t.accounting.activeCategory}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm({ ...form, is_active: event.target.checked })
                  }
                />
                {t.accounting.activeCategory}
              </label>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={save}
              loading={busy}
              disabled={!form.code.trim() || !form.name.trim()}
            >
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
