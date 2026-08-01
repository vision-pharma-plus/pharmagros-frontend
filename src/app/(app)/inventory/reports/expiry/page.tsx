"use client";

import { AlertTriangle } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Badge, Select } from "@/components/ui/primitives";
import type { Paginated } from "@/lib/api/client";
import type { StockBatch, Warehouse } from "@/lib/api/types";
import {
  formatDate,
  formatDays,
  formatMoney,
  formatQuantity,
} from "@/lib/format";
import { usePaginatedQuery, useQuery, useUrlFilters } from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";

/** Horizons the expiry scan alerts on, mirrored from the backend task. */
const HORIZONS = [30, 90, 180, 365] as const;

const DEFAULT_HORIZON = "90";

/**
 * Expiry horizon report.
 *
 * Target destination of the expiring-batches notification, which deep-links
 * with `?horizon=N`. Distinct from the batches screen: this one is ordered by
 * urgency and totals the value at risk, which is the figure that decides
 * whether a clearance is worth running.
 */
export default function ExpiryReportPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    horizon: DEFAULT_HORIZON,
    warehouse: "",
  });

  const warehouses = useQuery<Paginated<Warehouse>>("/inventory/warehouses/", {
    page_size: 100,
  });

  const query = usePaginatedQuery<StockBatch>("/inventory/batches/", {
    expiring_within_days: filters.horizon || DEFAULT_HORIZON,
    warehouse: filters.warehouse || undefined,
    in_stock: true,
  });

  // Value at risk across the loaded page. Summed client-side from the rows
  // already fetched rather than issued as a second aggregate call.
  const valueAtRisk = query.items.reduce(
    (total, row) => total + Number(row.stock_value || 0),
    0,
  );

  const expiryTone = (days: number) => {
    if (days <= 30) return "destructive" as const;
    if (days <= 90) return "warning" as const;
    return "secondary" as const;
  };

  const columns: Column<StockBatch>[] = [
    {
      key: "expiry",
      header: t.inventory.expiryDate,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{formatDate(row.expiry_date)}</span>
          <Badge variant={expiryTone(row.days_to_expiry)}>
            {row.days_to_expiry <= 30 ? (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {formatDays(row.days_to_expiry, locale)}
              </span>
            ) : (
              formatDays(row.days_to_expiry, locale)
            )}
          </Badge>
        </div>
      ),
    },
    {
      key: "batch",
      header: t.inventory.batchNumber,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.batch_number}</span>
      ),
    },
    {
      key: "product",
      header: t.catalog.name,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.product_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.product_code}
          </p>
        </div>
      ),
    },
    {
      key: "warehouse",
      header: t.inventory.warehouse,
      render: (row) => (
        <span className="text-muted-foreground">{row.warehouse_code}</span>
      ),
    },
    {
      key: "remaining",
      header: t.inventory.quantityRemaining,
      numeric: true,
      render: (row) => formatQuantity(row.quantity_remaining),
    },
    {
      key: "value",
      header: t.reports.valueAtRisk,
      numeric: true,
      render: (row) => (
        <span className="font-medium">{formatMoney(row.stock_value)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {t.inventory.expiryHorizonReport}
          </h1>
          <p className="text-sm text-muted-foreground">{t.nav.inventory}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {t.reports.valueAtRisk}
          </p>
          <p className="text-xl font-semibold tabular-nums">
            {formatMoney(String(valueAtRisk))}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => row.id}
        loading={query.loading}
        error={query.error}
        onRetry={query.refetch}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        page={query.page}
        totalPages={query.totalPages}
        count={query.count}
        onPageChange={query.setPage}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.horizon || DEFAULT_HORIZON}
              onChange={(event) => setFilter("horizon", event.target.value)}
              className="w-52"
              aria-label={t.inventory.expiringSoon}
            >
              {HORIZONS.map((days) => (
                <option key={days} value={days}>
                  {`${t.inventory.expiringSoon} : ${formatDays(days, locale)}`}
                </option>
              ))}
            </Select>

            <Select
              aria-label={t.inventory.warehouse}
              value={filters.warehouse}
              onChange={(event) => setFilter("warehouse", event.target.value)}
              className="w-52"
            >
              <option value="">{t.common.all}</option>
              {(warehouses.data?.results ?? []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />
    </div>
  );
}
