"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select } from "@/components/ui/primitives";
import type { User } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function UsersPage() {
  const t = useTranslation();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    active: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<User>("/auth/users/", {
    search: debouncedSearch || undefined,
    is_active: filters.active || undefined,
  });

  const columns: Column<User>[] = [
    {
      key: "name",
      header: t.admin.fullName,
      render: (row) => (
        <div className="min-w-0">
          <span className="truncate font-medium">{row.full_name}</span>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: "employee",
      header: t.admin.employeeCode,
      render: (row) => (
        <span className="font-mono text-xs">{row.employee_code || "—"}</span>
      ),
    },
    {
      key: "jobTitle",
      header: t.admin.jobTitle,
      render: (row) => (
        <span className="text-muted-foreground">{row.job_title || "—"}</span>
      ),
    },
    {
      key: "roles",
      header: t.admin.roles,
      render: (row) =>
        row.role_codes.length ? (
          <div className="flex flex-wrap gap-1">
            {row.role_codes.map((code) => (
              <Badge key={code} variant="secondary">
                {code}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "lastLogin",
      header: t.admin.lastLogin,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.last_login ? formatDateTime(row.last_login) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) => {
        // Suspension is shown ahead of inactivity: a suspended account is a
        // deliberate act an administrator needs to see at a glance.
        if (row.is_suspended) {
          return <Badge variant="destructive">{t.admin.suspended}</Badge>;
        }
        return (
          <Badge variant={row.is_active ? "success" : "secondary"}>
            {row.is_active ? t.admin.active : t.status.INACTIVE}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.users}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.administration}</p>
        </div>
        {can("accounts.add_user") && (
          <Button onClick={() => router.push("/admin/users/new")}>
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
        onRowClick={(row) => router.push(`/admin/users/${row.id}`)}
        toolbar={
          <Select
            aria-label={t.common.status}
            value={filters.active}
            onChange={(event) => setFilter("active", event.target.value)}
            className="w-auto"
          >
            <option value="">{t.common.all}</option>
            <option value="true">{t.admin.active}</option>
            <option value="false">{t.status.INACTIVE}</option>
          </Select>
        }
      />
    </div>
  );
}
