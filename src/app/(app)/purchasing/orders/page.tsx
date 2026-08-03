"use client";

import { PackageCheck, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select, statusVariant } from "@/components/ui/primitives";
import type { PurchaseOrderListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

const RECEIVABLE = new Set(["APPROVED", "SENT", "PARTIALLY_RECEIVED"]);

export default function PurchaseOrdersPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    status: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<PurchaseOrderListItem>(
    "/purchasing/orders/",
    {
      search: debouncedSearch || undefined,
      status: filters.status || undefined,
    },
  );

  const columns: Column<PurchaseOrderListItem>[] = [
    {
      key: "number",
      header: t.purchasing.orderNumber,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.order_number}</span>
      ),
    },
    {
      key: "supplier",
      header: t.purchasing.supplier,
      render: (row) => <span className="font-medium">{row.supplier_name}</span>,
    },
    {
      key: "date",
      header: t.purchasing.orderDate,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.order_date)}</span>
      ),
    },
    {
      key: "expected",
      header: t.purchasing.expectedDelivery,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {formatDate(row.expected_delivery_date)}
          </span>
          {row.is_overdue && (
            <Badge variant="destructive">{t.invoicing.overdue}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "total",
      header: t.common.total,
      numeric: true,
      render: (row) => fmt.money(row.total_amount),
    },
    {
      key: "progress",
      header: t.purchasing.quantityReceived,
      numeric: true,
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {Number(row.receipt_progress).toFixed(0)} %
        </span>
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
    {
      key: "actions",
      header: "",
      render: (row) =>
        can("purchasing.receive_goods") && RECEIVABLE.has(row.status) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/inventory/receive?order=${row.id}`);
            }}
          >
            <PackageCheck className="h-4 w-4" />
            {t.purchasing.receiveGoods}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.purchaseOrders}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.purchasing}</p>
        </div>
        {can("purchasing.add_order") && (
          <Button onClick={() => router.push("/purchasing/orders/new")}>
            <Plus className="h-4 w-4" />
            {t.purchasing.newOrder}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/purchasing/orders/${row.id}`)}
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
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
            className="w-52"
            aria-label={t.common.status}
          >
            <option value="">{t.common.all}</option>
            <option value="PENDING_APPROVAL">{t.status.PENDING_APPROVAL}</option>
            <option value="APPROVED">{t.status.APPROVED}</option>
            <option value="PARTIALLY_RECEIVED">
              {t.status.PARTIALLY_RECEIVED}
            </option>
            <option value="RECEIVED">{t.status.RECEIVED}</option>
          </Select>
        }
      />
    </div>
  );
}
