"use client";

import { DataTable, type Column } from "@/components/data-table";
import { Badge, Select } from "@/components/ui/primitives";
import type { StockMovement, Warehouse } from "@/lib/api/types";
import type { Paginated } from "@/lib/api/client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  useDebounced,
  usePaginatedQuery,
  useQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Movement types offered as filters.
 *
 * The label shown on a row comes from the server's `movement_type_display`,
 * so this list only has to supply the filter values — the enum is not
 * re-translated here and cannot drift out of step with the backend's labels.
 */
const MOVEMENT_TYPES = [
  "RECEIPT",
  "ISSUE",
  "SALE_RETURN",
  "PURCHASE_RETURN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "EXPIRY",
  "DISPOSAL",
  "OPENING",
] as const;

export default function StockMovementsPage() {
  const t = useTranslation();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    movement_type: "",
    warehouse: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const warehouses = useQuery<Paginated<Warehouse>>("/inventory/warehouses/", {
    page_size: 100,
  });

  const query = usePaginatedQuery<StockMovement>("/inventory/movements/", {
    search: debouncedSearch || undefined,
    movement_type: filters.movement_type || undefined,
    warehouse: filters.warehouse || undefined,
  });

  const columns: Column<StockMovement>[] = [
    {
      key: "date",
      header: t.inventory.movementDate,
      render: (row) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.performed_at)}
        </span>
      ),
    },
    {
      key: "product",
      header: t.catalog.name,
      render: (row) => (
        <div className="min-w-0">
          <span className="truncate font-medium">{row.product_name}</span>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {row.product_code}
          </p>
        </div>
      ),
    },
    {
      key: "batch",
      header: t.inventory.batchNumber,
      render: (row) => (
        <span className="font-mono text-xs">{row.batch_number}</span>
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
      key: "type",
      header: t.inventory.movementType,
      render: (row) => <Badge variant="secondary">{row.movement_type_display}</Badge>,
    },
    {
      key: "delta",
      header: t.inventory.quantityDelta,
      numeric: true,
      render: (row) => {
        // The sign is the whole point of a ledger row, so an inbound movement
        // is coloured and explicitly signed rather than left to be inferred.
        const isNegative = row.quantity_delta.trim().startsWith("-");
        return (
          <span
            className={
              isNegative ? "font-medium text-destructive" : "font-medium text-success"
            }
          >
            {isNegative ? "" : "+"}
            {formatQuantity(row.quantity_delta)}
          </span>
        );
      },
    },
    {
      key: "balance",
      header: t.inventory.balanceAfter,
      numeric: true,
      render: (row) => formatQuantity(row.balance_after),
    },
    {
      key: "value",
      header: t.inventory.stockValue,
      numeric: true,
      render: (row) => formatMoney(row.total_value),
    },
    {
      key: "source",
      header: t.inventory.sourceReference,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.source_reference || "—"}
        </span>
      ),
    },
    {
      key: "by",
      header: t.inventory.performedBy,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.performed_by_name || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.nav.movements}</h1>
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
              aria-label={t.inventory.movementType}
              value={filters.movement_type}
              onChange={(event) =>
                setFilter("movement_type", event.target.value)
              }
              className="w-auto"
            >
              <option value="">{t.inventory.allMovementTypes}</option>
              {MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>

            <Select
              aria-label={t.inventory.warehouse}
              value={filters.warehouse}
              onChange={(event) => setFilter("warehouse", event.target.value)}
              className="w-auto"
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
