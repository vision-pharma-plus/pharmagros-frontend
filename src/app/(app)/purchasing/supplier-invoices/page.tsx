"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Progress,
  Select,
  statusVariant,
} from "@/components/ui/primitives";
import type { SupplierInvoiceListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

/**
 * Supplier invoices — the payables list and the permanent record of what was
 * billed.
 *
 * Shows every invoice, settled ones included. A paid invoice does not stop
 * being part of the financial history the moment it is paid, and an operator
 * looking up what a supplier charged six months ago must find it here rather
 * than having to know which filter hides it. Status is a column and a filter,
 * never a reason to omit a row.
 */
export default function SupplierInvoicesPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  // Everything is listed by default, paid invoices included. A settled
  // invoice is permanent financial history — it stays searchable and
  // filterable here, and its status column is what distinguishes it. Hiding
  // it behind a filter would make the list disagree with the books.
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    status: "",
    outstanding: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<SupplierInvoiceListItem>(
    "/purchasing/supplier-invoices/",
    {
      search: debouncedSearch || undefined,
      status: filters.status || undefined,
      outstanding: filters.outstanding || undefined,
    },
  );

  const columns: Column<SupplierInvoiceListItem>[] = [
    {
      key: "number",
      header: t.payables.invoiceNumber,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">
            {row.invoice_number}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.reference}
          </p>
        </div>
      ),
    },
    {
      key: "supplier",
      header: t.purchasing.supplier,
      render: (row) => (
        <span className="truncate font-medium">{row.supplier_name}</span>
      ),
    },
    {
      key: "date",
      header: t.payables.invoiceDate,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.invoice_date)}</span>
      ),
    },
    {
      key: "due",
      header: t.payables.dueDate,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{formatDate(row.due_date)}</span>
          {row.is_overdue && (
            <Badge variant="destructive">
              {row.days_overdue} {t.payables.daysOverdue.toLowerCase()}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "total",
      header: t.payables.totalAmount,
      numeric: true,
      render: (row) => fmt.money(row.total_amount),
    },
    {
      key: "balance",
      header: t.payables.balanceDue,
      numeric: true,
      render: (row) => (
        <span className={row.is_overdue ? "font-medium text-destructive" : ""}>
          {fmt.money(row.balance_due)}
        </span>
      ),
    },
    {
      key: "progress",
      header: t.payables.paymentProgress,
      // The brief asks for a progress bar and a percentage on supplier
      // payments; this is where the answer is scanned across many invoices at
      // once, so it belongs in the list as well as on the detail.
      render: (row) => (
        <div className="w-32">
          <Progress
            value={row.payment_progress}
            tone={
              Number(row.payment_progress) >= 100
                ? "success"
                : row.is_overdue
                  ? "danger"
                  : "default"
            }
          />
        </div>
      ),
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
          <h1 className="text-2xl font-semibold">{t.payables.supplierInvoices}</h1>
          <p className="text-sm text-muted-foreground">
            {t.payables.supplierInvoicesSubtitle}
          </p>
        </div>
        {can("purchasing.record_supplier_invoice") && (
          <Button
            onClick={() => router.push("/purchasing/supplier-invoices/new")}
          >
            <Plus className="h-4 w-4" />
            {t.payables.newSupplierInvoice}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        onRowClick={(row) =>
          router.push(`/purchasing/supplier-invoices/${row.id}`)
        }
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
              value={filters.outstanding}
              onChange={(event) => setFilter("outstanding", event.target.value)}
              className="w-44"
              aria-label={t.payables.outstandingInvoices}
            >
              <option value="">{t.payables.allInvoices}</option>
              <option value="true">{t.payables.outstandingInvoices}</option>
              <option value="false">{t.payables.settledInvoices}</option>
            </Select>
            <Select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="w-44"
              aria-label={t.common.status}
            >
              <option value="">{t.common.all}</option>
              <option value="AWAITING_PAYMENT">{t.status.AWAITING_PAYMENT}</option>
              <option value="PARTIALLY_PAID">{t.status.PARTIALLY_PAID}</option>
              <option value="OVERDUE">{t.status.OVERDUE}</option>
              <option value="PAID">{t.status.PAID}</option>
              <option value="CANCELLED">{t.status.CANCELLED}</option>
            </Select>
          </>
        }
      />
    </div>
  );
}
