"use client";

import { BadgeCheck, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select, statusVariant } from "@/components/ui/primitives";
import type { Supplier } from "@/lib/api/types";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function SuppliersPage() {
  const t = useTranslation();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    approved: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<Supplier>("/partners/suppliers/", {
    search: debouncedSearch || undefined,
    is_approved: filters.approved || undefined,
  });

  const columns: Column<Supplier>[] = [
    {
      key: "code",
      header: t.partners.supplierCode,
      render: (row) => (
        <span className="font-mono text-xs">{row.supplier_code}</span>
      ),
    },
    {
      key: "name",
      header: t.partners.supplierName,
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{row.name}</span>
            {/* Approval gates whether this supplier can be put on a purchase
                order, so it is flagged on the row rather than only on detail. */}
            {row.is_approved && (
              <BadgeCheck
                className="h-3.5 w-3.5 shrink-0 text-success"
                aria-label={t.partners.approved}
              />
            )}
          </div>
          {row.nif && (
            <p className="truncate text-xs text-muted-foreground">
              NIF {row.nif}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "country",
      header: t.partners.country,
      render: (row) => (
        <span className="text-muted-foreground">{row.country || "—"}</span>
      ),
    },
    {
      key: "currency",
      header: t.partners.currency,
      render: (row) => <span className="font-mono text-xs">{row.currency}</span>,
    },
    {
      key: "leadTime",
      header: t.partners.leadTime,
      numeric: true,
      render: (row) => `${row.lead_time_days} j`,
    },
    {
      key: "approved",
      header: t.partners.approved,
      render: (row) => (
        <Badge variant={row.is_approved ? "success" : "secondary"}>
          {row.is_approved ? t.partners.approved : t.partners.notApproved}
        </Badge>
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
          <h1 className="text-2xl font-semibold">{t.nav.suppliers}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.partners}</p>
        </div>
        {can("partners.add_supplier") && (
          <Button onClick={() => router.push("/partners/suppliers/new")}>
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
        page={query.page}
        totalPages={query.totalPages}
        count={query.count}
        onPageChange={query.setPage}
        onRowClick={(row) => router.push(`/partners/suppliers/${row.id}`)}
        toolbar={
          <Select
            aria-label={t.partners.approved}
            value={filters.approved}
            onChange={(event) => setFilter("approved", event.target.value)}
            className="w-auto"
          >
            <option value="">{t.common.all}</option>
            <option value="true">{t.partners.approvedOnly}</option>
            <option value="false">{t.partners.notApproved}</option>
          </Select>
        }
      />
    </div>
  );
}
