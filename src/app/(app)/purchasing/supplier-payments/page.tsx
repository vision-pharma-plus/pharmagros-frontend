"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select } from "@/components/ui/primitives";
import type { SupplierPaymentListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function SupplierPaymentsPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    method: "",
    unallocated: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<SupplierPaymentListItem>(
    "/purchasing/supplier-payments/",
    {
      search: debouncedSearch || undefined,
      method: filters.method || undefined,
      unallocated: filters.unallocated || undefined,
    },
  );

  const columns: Column<SupplierPaymentListItem>[] = [
    {
      key: "reference",
      header: t.payables.paymentReference,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">
            {row.reference}
          </p>
          {row.bank_reference && (
            <p className="truncate text-xs text-muted-foreground">
              {row.bank_reference}
            </p>
          )}
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
      header: t.payables.paymentDate,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.payment_date)}</span>
      ),
    },
    {
      key: "method",
      header: t.payables.paymentMethod,
      render: (row) =>
        t.paymentMethods[row.method as keyof typeof t.paymentMethods] ??
        row.method,
    },
    {
      key: "amount",
      header: t.payables.amountPaid,
      numeric: true,
      render: (row) => (
        <span className={row.is_reversed ? "line-through opacity-60" : ""}>
          {fmt.money(row.amount)}
        </span>
      ),
    },
    {
      key: "unallocated",
      header: t.payables.unallocatedAmount,
      numeric: true,
      // Money paid but not yet matched to an invoice. Surfaced in the list
      // because it is the actionable state: it needs someone to allocate it.
      render: (row) =>
        Number(row.unallocated_amount) > 0 ? (
          <span className="font-medium text-amber-600 dark:text-amber-500">
            {fmt.money(row.unallocated_amount)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) =>
        row.is_reversed ? (
          <Badge variant="destructive">{t.payables.reversed}</Badge>
        ) : (
          <Badge variant="success">{t.status.PAID}</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.payables.supplierPayments}</h1>
          <p className="text-sm text-muted-foreground">
            {t.payables.supplierPaymentsSubtitle}
          </p>
        </div>
        {can("purchasing.record_supplier_payment") && (
          <Button
            onClick={() => router.push("/purchasing/supplier-payments/new")}
          >
            <Plus className="h-4 w-4" />
            {t.payables.newPayment}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        onRowClick={(row) =>
          router.push(`/purchasing/supplier-payments/${row.id}`)
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
              value={filters.method}
              onChange={(event) => setFilter("method", event.target.value)}
              className="w-44"
              aria-label={t.payables.paymentMethod}
            >
              <option value="">{t.common.all}</option>
              {Object.entries(t.paymentMethods).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={filters.unallocated}
              onChange={(event) => setFilter("unallocated", event.target.value)}
              className="w-44"
              aria-label={t.payables.unallocatedAmount}
            >
              <option value="">{t.common.all}</option>
              <option value="true">{t.payables.unallocatedAmount}</option>
            </Select>
          </>
        }
      />
    </div>
  );
}
