"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Alert, Badge, Select } from "@/components/ui/primitives";
import type { Paginated } from "@/lib/api/client";
import type { Warehouse } from "@/lib/api/types";
import { formatQuantity } from "@/lib/format";
import { useQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

interface Discrepancy {
  batch_id: string;
  batch_number: string;
  cached_balance: string;
  ledger_balance: string;
  discrepancy: string;
  reconciled: boolean;
}

interface ReconciliationResponse {
  discrepancy_count: number;
  discrepancies: Discrepancy[];
}

/**
 * Stock reconciliation.
 *
 * Target destination of the CRITICAL stock-discrepancy notification. A
 * non-empty result means a batch balance disagrees with its ledger, which is
 * a data integrity incident rather than an operational warning — so the empty
 * state here is the good one, and it says so explicitly.
 */
export default function ReconciliationReportPage() {
  const t = useTranslation();
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    warehouse: "",
  });

  const warehouses = useQuery<Paginated<Warehouse>>("/inventory/warehouses/", {
    page_size: 100,
  });

  const query = useQuery<ReconciliationResponse>(
    "/inventory/reconciliation/",
    { warehouse: filters.warehouse || undefined },
  );

  const rows = query.data?.discrepancies ?? [];
  const clean = !query.loading && !query.error && rows.length === 0;

  const columns: Column<Discrepancy>[] = [
    {
      key: "batch",
      header: t.inventory.batchNumber,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.batch_number}</span>
      ),
    },
    {
      key: "cached",
      header: t.inventory.quantityRemaining,
      numeric: true,
      render: (row) => formatQuantity(row.cached_balance),
    },
    {
      key: "ledger",
      header: t.inventory.balanceAfter,
      numeric: true,
      render: (row) => formatQuantity(row.ledger_balance),
    },
    {
      key: "delta",
      header: t.inventory.discrepanciesFound,
      numeric: true,
      // The gap is the finding, so it is signed and coloured rather than left
      // for the reader to subtract two columns in their head.
      render: (row) => {
        const isNegative = row.discrepancy.trim().startsWith("-");
        return (
          <span className="font-medium text-destructive">
            {isNegative ? "" : "+"}
            {formatQuantity(row.discrepancy)}
          </span>
        );
      },
    },
    {
      key: "state",
      header: t.common.status,
      render: (row) =>
        row.reconciled ? (
          <Badge variant="success">{t.common.yes}</Badge>
        ) : (
          <Badge variant="destructive">{t.inventory.discrepanciesFound}</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.inventory.reconciliation}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.inventory}</p>
      </div>

      {clean && (
        <Alert>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
            {t.inventory.noDiscrepancies}
          </span>
        </Alert>
      )}

      {rows.length > 0 && (
        <Alert variant="destructive" title={t.inventory.discrepanciesFound}>
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            {t.inventory.reconciliationIncidentHint}
          </span>
        </Alert>
      )}

      {/* The warehouse filter stays available on a clean run so the operator
          can narrow the scan; only the empty results grid is dropped. */}
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

      {/* A clean run is the expected outcome, and the banner above already
          says so — an empty results table underneath it just reads as a
          second, more ambiguous answer to the same question. */}
      {!clean && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.batch_id}
          loading={query.loading}
          error={query.error}
          onRetry={query.refetch}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
        />
      )}
    </div>
  );
}
