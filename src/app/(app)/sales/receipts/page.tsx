"use client";

import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/primitives";
import type { SalesReceiptListItem } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * The register of cash sale receipts.
 *
 * Receipts are raised by confirming a cash sale, never created here — a
 * receipt without a sale behind it would be proof of a payment for nothing.
 * The `invoiced` filter answers the end-of-day question: which counter sales
 * still have no invoice, for customers or tax rules that require one.
 */
export default function SalesReceiptsPage() {
  const t = useTranslation();
  const router = useRouter();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    invoiced: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<SalesReceiptListItem>("/sales/receipts/", {
    search: debouncedSearch || undefined,
    invoiced: filters.invoiced || undefined,
  });

  const columns: Column<SalesReceiptListItem>[] = [
    {
      key: "number",
      header: t.sales.receiptNumber,
      render: (row) => (
        <span className="font-mono text-xs">{row.receipt_number}</span>
      ),
    },
    {
      key: "date",
      header: t.common.date,
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.issued_at)}</span>
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
      key: "method",
      header: t.sales.paymentMethod,
      render: (row) => (
        <span className="text-muted-foreground">
          {t.paymentMethods[
            row.payment_method as keyof typeof t.paymentMethods
          ] ?? row.payment_method}
        </span>
      ),
    },
    {
      key: "invoice",
      header: t.invoicing.invoiceNumber,
      render: (row) =>
        row.invoice_number ? (
          <Badge variant="secondary" className="font-mono">
            {row.invoice_number}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) =>
        row.is_cancelled ? (
          <Badge variant="destructive">{t.common.cancelled}</Badge>
        ) : (
          <Badge variant="success">{t.sales.paidInFull}</Badge>
        ),
    },
    {
      key: "total",
      header: t.common.total,
      numeric: true,
      render: (row) => (
        <span className="font-medium">{formatMoney(row.total_amount)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.sales.receipts}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.sales}</p>
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/sales/receipts/${row.id}`)}
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
