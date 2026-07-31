"use client";

import { Lock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, statusVariant } from "@/components/ui/primitives";
import type { MedicineListItem } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function MedicinesPage() {
  const t = useTranslation();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<MedicineListItem>("/catalog/medicines/", {
    search: debouncedSearch || undefined,
  });

  const columns: Column<MedicineListItem>[] = [
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
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{row.name}</span>
            {row.strength && (
              <span className="text-muted-foreground">{row.strength}</span>
            )}
            {/* Controlled substances and cold-chain products are flagged in
                the list: both change how the item must be handled, and a user
                should not have to open the record to find out. */}
            {row.is_controlled && (
              <Lock className="h-3.5 w-3.5 text-destructive" aria-label={t.catalog.isControlled} />
            )}
          </div>
          {row.generic_name && (
            <p className="truncate text-xs text-muted-foreground">
              {row.generic_name}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: t.catalog.category,
      render: (row) => (
        <span className="text-muted-foreground">{row.category_name}</span>
      ),
    },
    {
      key: "price",
      header: t.catalog.sellingPrice,
      numeric: true,
      render: (row) => formatMoney(row.selling_price),
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
          <h1 className="text-2xl font-semibold">{t.nav.medicines}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.catalog}</p>
        </div>
        {can("catalog.add_medicine") && (
          <Button onClick={() => router.push("/catalog/medicines/new")}>
            <Plus className="h-4 w-4" />
            {t.common.create}
          </Button>
        )}
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
        searchPlaceholder={`${t.common.search}…`}
        page={query.page}
        totalPages={query.totalPages}
        count={query.count}
        onPageChange={query.setPage}
        onRowClick={(row) => router.push(`/catalog/medicines/${row.id}`)}
      />
    </div>
  );
}
