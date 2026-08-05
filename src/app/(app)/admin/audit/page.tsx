"use client";

import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { TranslatableText } from "@/components/translatable-text";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Select } from "@/components/ui/primitives";
import { api } from "@/lib/api/client";
import type { AuditLogEntry } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface ChainResult {
  valid: boolean;
  checked: number;
  broken_at_id: number | null;
  reason: string;
}

/** Actions that change money, stock or permissions. */
const SENSITIVE = new Set([
  "DELETE",
  "PERMISSION_CHANGE",
  "PRICE_CHANGE",
  "CANCEL",
  "LOCKOUT",
  "LOGIN_FAILED",
]);

export default function AuditLogPage() {
  const t = useTranslation();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    action: "",
  });
  const [chain, setChain] = useState<ChainResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<AuditLogEntry>("/core/audit-logs/", {
    search: debouncedSearch || undefined,
    action: filters.action || undefined,
  });

  const verifyChain = async () => {
    setVerifying(true);
    try {
      setChain(await api.post<ChainResult>("/core/audit-logs/verify/"));
    } finally {
      setVerifying(false);
    }
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "timestamp",
      header: t.common.date,
      render: (row) => (
        <span className="whitespace-nowrap tabular-nums text-xs">
          {formatDateTime(row.timestamp)}
        </span>
      ),
    },
    {
      key: "actor",
      header: t.inventory.performedBy,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.actor_username}</p>
          {row.actor_role && (
            <p className="truncate text-xs text-muted-foreground">
              {row.actor_role}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "action",
      header: t.common.actions,
      render: (row) => (
        <Badge variant={SENSITIVE.has(row.action) ? "warning" : "secondary"}>
          {row.action_display}
        </Badge>
      ),
    },
    {
      key: "entity",
      header: t.audit.entity,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.entity_label || row.entity_type}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.entity_type}
          </p>
        </div>
      ),
    },
    {
      key: "changes",
      header: t.audit.changes,
      render: (row) => (
        <div className="min-w-0 max-w-md">
          {/* Not truncated, unlike the changed-fields line below: the
              translate control has to stay clickable, and a clipped audit
              note is the one thing a reader most needs to read in full. */}
          {row.notes && (
            <TranslatableText inline text={row.notes} className="text-sm" />
          )}
          {row.changed_fields.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              {row.changed_fields.join(", ")}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "ip",
      header: "IP",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.ip_address ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.auditLog}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.administration}</p>
        </div>
        {can("core.verify_auditlog") && (
          <Button
            variant="outline"
            loading={verifying}
            onClick={() => void verifyChain()}
          >
            <ShieldCheck className="h-4 w-4" />
            {t.audit.verifyChain}
          </Button>
        )}
      </div>

      {chain && (
        <Alert variant={chain.valid ? "success" : "destructive"}>
          <span className="flex items-start gap-2">
            {chain.valid ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {chain.valid ? (
                <>
                  {t.audit.chainValid} {chain.checked} {t.common.results}
                </>
              ) : (
                <>
                  {t.audit.chainBroken}: #{chain.broken_at_id} — {chain.reason}
                </>
              )}
            </span>
          </span>
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={query.items}
        rowKey={(row) => String(row.id)}
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
          <Select
            value={filters.action}
            onChange={(event) => setFilter("action", event.target.value)}
            className="w-52"
            aria-label={t.common.actions}
          >
            <option value="">{t.common.all}</option>
            {Object.entries(t.auditActions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        }
      />
    </div>
  );
}
