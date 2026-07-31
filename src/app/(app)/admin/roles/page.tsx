"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import type { Role } from "@/lib/api/types";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function RolesPage() {
  const t = useTranslation();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<Role>("/auth/roles/", {
    search: debouncedSearch || undefined,
  });

  const columns: Column<Role>[] = [
    {
      key: "code",
      header: t.admin.roleCode,
      render: (row) => <span className="font-mono text-xs">{row.code}</span>,
    },
    {
      key: "name",
      header: t.catalog.name,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{row.name}</span>
          {row.is_system && (
            <Badge variant="secondary">{t.admin.systemRole}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "permissions",
      header: t.admin.permissions,
      numeric: true,
      render: (row) => row.permission_codes.length,
    },
    {
      key: "users",
      header: t.admin.userCount,
      numeric: true,
      render: (row) => row.user_count,
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? t.admin.active : t.status.INACTIVE}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.roles}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.administration}</p>
        </div>
        {can("accounts.manage_roles") && (
          <Button onClick={() => router.push("/admin/roles/new")}>
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
        onRowClick={(row) => router.push(`/admin/roles/${row.id}`)}
      />
    </div>
  );
}
