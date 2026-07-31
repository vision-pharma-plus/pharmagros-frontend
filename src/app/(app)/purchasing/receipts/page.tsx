"use client";

import { DataTable, type Column } from "@/components/data-table";
import { Alert, Badge, Select } from "@/components/ui/primitives";
import type { GoodsReceipt } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Goods receipts are booked against a purchase order, so this is a read-only
 * register across every order — the place to answer "when did that delivery
 * actually arrive" without knowing the order number first.
 */
export default function GoodsReceiptsPage() {
  const t = useTranslation();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    quality_checked: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<GoodsReceipt>("/purchasing/receipts/", {
    search: debouncedSearch || undefined,
    quality_checked: filters.quality_checked || undefined,
  });

  const columns: Column<GoodsReceipt>[] = [
    {
      key: "number",
      header: t.purchasing.receiptNumber,
      render: (row) => (
        <span className="font-mono text-xs">{row.receipt_number}</span>
      ),
    },
    {
      key: "date",
      header: t.purchasing.receiptDate,
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.receipt_date)}</span>
      ),
    },
    {
      key: "order",
      header: t.purchasing.orderNumber,
      render: (row) => (
        <span className="font-mono text-xs">{row.order_number}</span>
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
      key: "deliveryNote",
      header: t.purchasing.deliveryNote,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.delivery_note_number || "—"}
        </span>
      ),
    },
    {
      key: "lines",
      header: t.sections.lineItems,
      numeric: true,
      render: (row) => row.lines.length,
    },
    {
      key: "quality",
      header: t.purchasing.qualityChecked,
      render: (row) => (
        // An unchecked receipt is stock that has not cleared QA, so the
        // absence is called out rather than left blank.
        <Badge variant={row.quality_checked ? "success" : "warning"}>
          {row.quality_checked ? t.common.yes : t.common.no}
        </Badge>
      ),
    },
    {
      key: "receivedBy",
      header: t.inventory.performedBy,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.received_by_name || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.purchasing.receiptsList}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.purchasing}</p>
      </div>

      <Alert>{t.purchasing.receiptsCreatedFromOrder}</Alert>

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
            aria-label={t.purchasing.qualityChecked}
            value={filters.quality_checked}
            onChange={(event) => setFilter("quality_checked", event.target.value)}
            className="w-auto"
          >
            <option value="">{t.common.all}</option>
            <option value="true">{t.purchasing.qualityChecked}</option>
            <option value="false">{t.common.no}</option>
          </Select>
        }
      />
    </div>
  );
}
