"use client";

import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { Badge, Select } from "@/components/ui/primitives";
import type { StockLevel } from "@/lib/api/types";
import { formatQuantity } from "@/lib/format";
import { useQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

type StockFilter = "" | "low_stock" | "out_of_stock" | "in_stock";

export default function StockLevelsPage() {
  const t = useTranslation();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    filter: "",
  });

  // This endpoint returns a plain array rather than a paginated envelope: it
  // is an aggregate across all products, and the operator needs the whole
  // picture at once to plan replenishment.
  const query = useQuery<StockLevel[]>("/inventory/stock-levels/", {
    filter: filters.filter || undefined,
  });

  const rows = query.data ?? [];

  const columns: Column<StockLevel>[] = [
    {
      key: "code",
      header: t.catalog.productCode,
      render: (row) => (
        <span className="font-mono text-xs">{row.product_code}</span>
      ),
    },
    {
      key: "name",
      header: t.catalog.name,
      render: (row) => <span className="font-medium">{row.product_name}</span>,
    },
    {
      key: "onHand",
      header: t.inventory.quantityRemaining,
      numeric: true,
      render: (row) => formatQuantity(row.quantity_on_hand),
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
      key: "reorder",
      header: t.catalog.reorderLevel,
      numeric: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {formatQuantity(row.reorder_level)}
        </span>
      ),
    },
    {
      key: "batches",
      header: t.nav.batches,
      numeric: true,
      render: (row) => row.batch_count,
    },
    {
      key: "state",
      header: t.common.status,
      render: (row) =>
        row.is_out ? (
          <Badge variant="destructive">{t.dashboard.outOfStock}</Badge>
        ) : row.is_low ? (
          <Badge variant="warning">{t.dashboard.lowStock}</Badge>
        ) : (
          <Badge variant="success">{t.inventory.inStock}</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.nav.stockLevels}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.inventory}</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.product_id}
        loading={query.loading}
        error={query.error}
        onRetry={query.refetch}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        toolbar={
          <Select
            value={filters.filter}
            onChange={(event) => setFilter("filter", event.target.value)}
            className="w-48"
            aria-label={t.common.filter}
          >
            <option value="">{t.common.all}</option>
            <option value="low_stock">{t.dashboard.lowStock}</option>
            <option value="out_of_stock">{t.dashboard.outOfStock}</option>
            <option value="in_stock">{t.inventory.inStock}</option>
          </Select>
        }
      />
    </div>
  );
}
