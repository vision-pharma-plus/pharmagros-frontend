"use client";

import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { StockAdjustDialog } from "@/components/stock-adjust-dialog";
import { Button } from "@/components/ui/button";
import { Badge, Select, statusVariant } from "@/components/ui/primitives";
import type { StockBatch } from "@/lib/api/types";
import {
  formatDate,
  formatDays,
  formatMoney,
  formatQuantity,
} from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

/**
 * Batch statuses offered as filters.
 *
 * Notifications deep-link here with `?status=EXPIRED`, so the value must
 * round-trip through the URL as well as the dropdown.
 */
const BATCH_STATUSES = [
  "ACTIVE",
  "QUARANTINED",
  "EXPIRED",
  "DAMAGED",
  "RECALLED",
  "DEPLETED",
  "DISPOSED",
] as const;

export default function BatchesPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    expiring: "",
    status: "",
  });
  const [adjustTarget, setAdjustTarget] = useState<StockBatch | null>(null);
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<StockBatch>("/inventory/batches/", {
    search: debouncedSearch || undefined,
    expiring_within_days: filters.expiring || undefined,
    status: filters.status || undefined,
    // Expired and disposed lots hold no sellable stock, so the default
    // in_stock guard would hide the very rows a status link asks for.
    in_stock: filters.status ? undefined : true,
  });

  /**
   * Expiry is the single most important column here, so it is colour-coded
   * rather than left as a plain date: at a glance the operator should see
   * which lots need clearing this quarter.
   */
  const expiryTone = (days: number) => {
    if (days < 0) return "destructive" as const;
    if (days <= 30) return "destructive" as const;
    if (days <= 90) return "warning" as const;
    return "secondary" as const;
  };

  const columns: Column<StockBatch>[] = [
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
      key: "expiry",
      header: t.inventory.expiryDate,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{formatDate(row.expiry_date)}</span>
          {/* Colour alone did not separate "45 days" from "200 days" for a
              colour-blind user; the urgent bands now carry an icon and a
              worded label as well. */}
          <Badge variant={expiryTone(row.days_to_expiry)}>
            {row.is_expired ? (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t.inventory.expired}
              </span>
            ) : row.days_to_expiry <= 30 ? (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t.inventory.expiringSoon} · {formatDays(row.days_to_expiry, locale)}
              </span>
            ) : (
              formatDays(row.days_to_expiry, locale)
            )}
          </Badge>
        </div>
      ),
    },
    {
      key: "remaining",
      header: t.inventory.quantityRemaining,
      numeric: true,
      render: (row) => formatQuantity(row.quantity_remaining),
    },
    {
      key: "available",
      header: t.inventory.quantityAvailable,
      numeric: true,
      render: (row) => (
        <span className="font-medium">
          {formatQuantity(row.quantity_available)}
        </span>
      ),
    },
    {
      key: "value",
      header: t.inventory.stockValue,
      numeric: true,
      render: (row) => formatMoney(row.stock_value),
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
        can("inventory.adjust_stock") ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdjustTarget(row)}
            aria-label={t.inventory.adjustStock}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.nav.batches}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.inventory}</p>
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
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.expiring}
              onChange={(event) => setFilter("expiring", event.target.value)}
              className="w-52"
              aria-label={t.inventory.expiringSoon}
            >
              <option value="">{t.common.all}</option>
              {[30, 90, 180].map((days) => (
                <option key={days} value={days}>
                  {`${t.inventory.expiringSoon} — ${formatDays(days, locale)}`}
                </option>
              ))}
            </Select>

            <Select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="w-48"
              aria-label={t.common.status}
            >
              <option value="">{t.common.all}</option>
              {BATCH_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.status[status as keyof typeof t.status] ?? status}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <StockAdjustDialog
        batch={adjustTarget}
        open={adjustTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAdjustTarget(null);
        }}
        onAdjusted={query.refetch}
      />
    </div>
  );
}
