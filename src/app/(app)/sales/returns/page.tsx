"use client";

import { DataTable, type Column } from "@/components/data-table";
import { Alert, Badge } from "@/components/ui/primitives";
import type { SaleReturn } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

/**
 * Returns are raised from the sale they reverse, so this screen is a
 * read-only register. Rows are not clickable: there is no sale detail route
 * to open, and the originating sale number is shown on the row instead.
 */
export default function SaleReturnsPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<SaleReturn>("/sales/returns/", {
    search: debouncedSearch || undefined,
  });

  const columns: Column<SaleReturn>[] = [
    {
      key: "number",
      header: t.sales.returnNumber,
      render: (row) => (
        <span className="font-mono text-xs">{row.return_number}</span>
      ),
    },
    {
      key: "date",
      header: t.sales.returnDate,
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.return_date)}</span>
      ),
    },
    {
      key: "sale",
      header: t.sales.saleNumber,
      render: (row) => (
        <span className="font-mono text-xs">{row.sale_number}</span>
      ),
    },
    {
      key: "customer",
      header: t.nav.customers,
      render: (row) => (
        <span className="truncate font-medium">{row.customer_name}</span>
      ),
    },
    {
      key: "reason",
      header: t.common.reason,
      render: (row) => (
        <span className="text-muted-foreground">{row.reason || "—"}</span>
      ),
    },
    {
      key: "creditNote",
      header: t.invoicing.creditNote,
      render: (row) =>
        row.credit_note_number ? (
          <Badge variant="secondary" className="font-mono">
            {row.credit_note_number}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "total",
      header: t.sales.refundAmount,
      numeric: true,
      render: (row) => (
        <span className="font-medium">{fmt.money(row.total_amount)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.sales.returnsList}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.sales}</p>
      </div>

      <Alert>{t.sales.returnsCreatedFromSale}</Alert>

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
    </div>
  );
}
