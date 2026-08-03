"use client";

import { Ban, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, statusVariant } from "@/components/ui/primitives";
import type { CustomerListItem } from "@/lib/api/types";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function CustomersPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<CustomerListItem>("/partners/customers/", {
    search: debouncedSearch || undefined,
  });

  const columns: Column<CustomerListItem>[] = [
    {
      key: "code",
      header: t.partners.customerCode,
      render: (row) => (
        <span className="font-mono text-xs">{row.customer_code}</span>
      ),
    },
    {
      key: "name",
      header: t.partners.businessName,
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{row.business_name}</span>
            {row.credit_blocked && (
              <Ban
                className="h-3.5 w-3.5 shrink-0 text-destructive"
                aria-label={t.partners.creditBlocked}
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
      key: "city",
      header: t.partners.city,
      render: (row) => (
        <span className="text-muted-foreground">{row.city}</span>
      ),
    },
    {
      key: "limit",
      header: t.partners.creditLimit,
      numeric: true,
      render: (row) => fmt.money(row.credit_limit),
    },
    {
      key: "balance",
      header: t.partners.outstandingBalance,
      numeric: true,
      render: (row) => (
        // An over-limit balance is shown in the destructive colour: it is the
        // signal that further credit sales will be refused, and the sales
        // floor needs to see it before starting an order.
        <span
          className={
            row.is_over_limit ? "font-semibold text-destructive" : undefined
          }
        >
          {fmt.money(row.outstanding_balance)}
        </span>
      ),
    },
    {
      key: "available",
      header: t.partners.availableCredit,
      numeric: true,
      render: (row) => fmt.money(row.available_credit),
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
          <h1 className="text-2xl font-semibold">{t.nav.customers}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.partners}</p>
        </div>
        {can("partners.add_customer") && (
          <Button onClick={() => router.push("/partners/customers/new")}>
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
        onRowClick={(row) => router.push(`/partners/customers/${row.id}`)}
      />
    </div>
  );
}
