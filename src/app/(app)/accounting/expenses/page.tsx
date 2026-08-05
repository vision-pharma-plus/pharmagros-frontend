"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select, statusVariant } from "@/components/ui/primitives";
import { api, type Paginated } from "@/lib/api/client";
import type { ExpenseCategory, ExpenseListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  useDebounced,
  usePaginatedQuery,
  useQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function ExpensesPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    category: "",
    status: "",
    unpaid: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const categories = useQuery<Paginated<ExpenseCategory>>(
    "/accounting/expense-categories/",
    { page_size: 100 },
  );

  const query = usePaginatedQuery<ExpenseListItem>("/accounting/expenses/", {
    search: debouncedSearch || undefined,
    category: filters.category || undefined,
    status: filters.status || undefined,
    unpaid: filters.unpaid || undefined,
  });

  const columns: Column<ExpenseListItem>[] = [
    {
      key: "reference",
      header: t.accounting.reference,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.reference}</span>
      ),
    },
    {
      key: "description",
      header: t.accounting.description,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.description}</p>
          {row.payee && (
            <p className="truncate text-xs text-muted-foreground">{row.payee}</p>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: t.accounting.category,
      render: (row) => <Badge variant="secondary">{row.category_name}</Badge>,
    },
    {
      key: "date",
      header: t.accounting.expenseDate,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.expense_date)}</span>
      ),
    },
    {
      key: "paid",
      header: t.accounting.paidDate,
      render: (row) =>
        row.paid_date ? (
          <span className="tabular-nums">{formatDate(row.paid_date)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "amount",
      header: t.accounting.amount,
      numeric: true,
      render: (row) => fmt.money(row.amount),
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {t.status[row.status as keyof typeof t.status] ?? row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.accounting.expenses}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.accounting}</p>
        </div>
        {can("accounting.add_expense") && (
          <Button onClick={() => router.push("/accounting/expenses/new")}>
            <Plus className="h-4 w-4" />
            {t.accounting.newExpense}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/accounting/expenses/${row.id}`)}
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
        toolbar={
          <>
            <Select
              value={filters.category}
              onChange={(event) => setFilter("category", event.target.value)}
              className="w-48"
              aria-label={t.accounting.category}
            >
              <option value="">{t.common.all}</option>
              {(categories.data?.results ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={filters.unpaid}
              onChange={(event) => setFilter("unpaid", event.target.value)}
              className="w-44"
              aria-label={t.accounting.unpaidOnly}
            >
              <option value="">{t.common.all}</option>
              <option value="true">{t.accounting.unpaidOnly}</option>
            </Select>
          </>
        }
      />
    </div>
  );
}
