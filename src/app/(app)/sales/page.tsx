"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select, statusVariant } from "@/components/ui/primitives";
import type { SaleListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function SalesPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  // Filters live in the URL so a filtered view survives a refresh and can be
  // bookmarked or shared.
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    sale_type: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<SaleListItem>("/sales/sales/", {
    search: debouncedSearch || undefined,
    sale_type: filters.sale_type || undefined,
  });

  const columns: Column<SaleListItem>[] = [
    {
      key: "number",
      header: t.sales.saleNumber,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.sale_number}</span>
      ),
    },
    {
      key: "customer",
      header: t.sales.customer,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.customer_code}
          </p>
        </div>
      ),
    },
    {
      key: "date",
      header: t.common.date,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.sale_date)}</span>
      ),
    },
    {
      key: "type",
      header: t.sales.saleType,
      render: (row) => (
        <Badge variant={row.sale_type === "CREDIT" ? "warning" : "secondary"}>
          {row.sale_type === "CREDIT" ? t.sales.creditSale : t.sales.cashSale}
        </Badge>
      ),
    },
    {
      key: "invoice",
      header: t.invoicing.invoiceNumber,
      render: (row) =>
        row.invoice_number ? (
          <span className="font-mono text-xs">{row.invoice_number}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "total",
      header: t.common.total,
      numeric: true,
      render: (row) => fmt.money(row.total_amount),
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
          <h1 className="text-2xl font-semibold">{t.nav.salesList}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.sales}</p>
        </div>
        {can("sales.add_sale") && (
          <Button onClick={() => router.push("/sales/new")}>
            <Plus className="h-4 w-4" />
            {t.nav.newSale}
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
        toolbar={
          <Select
            value={filters.sale_type}
            onChange={(event) => setFilter("sale_type", event.target.value)}
            className="w-44"
            aria-label={t.sales.saleType}
          >
            <option value="">{t.common.all}</option>
            <option value="CASH">{t.sales.cashSale}</option>
            <option value="CREDIT">{t.sales.creditSale}</option>
          </Select>
        }
      />
    </div>
  );
}
