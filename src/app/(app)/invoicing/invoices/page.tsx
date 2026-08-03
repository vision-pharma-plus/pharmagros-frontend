"use client";

import { Download, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge, Select, fiscalVariant, statusVariant } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, saveBlob } from "@/lib/api/client";
import type { InvoiceListItem } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, useDebounced, usePaginatedQuery, useUrlFilters } from "@/lib/hooks";
import { useFormat, useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function InvoicesPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    filter: "",
  });
  const [downloading, setDownloading] = useState<string | null>(null);
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<InvoiceListItem>("/invoicing/invoices/", {
    search: debouncedSearch || undefined,
    overdue: filters.filter === "overdue" ? true : undefined,
    unpaid: filters.filter === "unpaid" ? true : undefined,
    status: filters.filter === "draft" ? "DRAFT" : undefined,
    // The undeclared filter is what someone chasing a compliance backlog
    // actually wants: documents the OBR has refused and stopped retrying.
    fiscal_status: filters.filter === "obr_rejected" ? "REJECTED" : undefined,
  });

  const downloadPdf = async (invoice: InvoiceListItem) => {
    setDownloading(invoice.id);
    try {
      // The PDF renders in the viewer's language; the backend also records
      // the print, so reprints stay auditable even though every copy of the
      // document looks the same.
      const blob = await api.download(
        `/invoicing/invoices/${invoice.id}/pdf/`,
        { language: locale },
      );
      saveBlob(blob, `${invoice.invoice_number}.pdf`);
    } catch (caught) {
      toast.error(
        t.toasts.pdfFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setDownloading(null);
    }
  };

  const columns: Column<InvoiceListItem>[] = [
    {
      key: "number",
      header: t.invoicing.invoiceNumber,
      render: (row) => (
        <span className="font-mono text-xs font-medium">
          {row.invoice_number}
        </span>
      ),
    },
    {
      key: "customer",
      header: t.sales.customer,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name}</p>
          {row.customer_nif && (
            <p className="truncate text-xs text-muted-foreground">
              NIF {row.customer_nif}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "date",
      header: t.invoicing.invoiceDate,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.invoice_date)}</span>
      ),
    },
    {
      key: "due",
      header: t.invoicing.dueDate,
      render: (row) =>
        row.due_date ? (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{formatDate(row.due_date)}</span>
            {row.is_overdue && (
              <Badge variant="destructive">
                {row.days_overdue} {t.invoicing.daysOverdue}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "total",
      header: t.invoicing.totalAmount,
      numeric: true,
      render: (row) => fmt.money(row.total_amount),
    },
    {
      key: "balance",
      header: t.invoicing.balanceDue,
      numeric: true,
      render: (row) => {
        // Derived here rather than served: the list already carries both
        // figures, and `payment_progress` is a detail-serializer field. A
        // part-settled invoice is the only case the balance figure alone
        // cannot convey, so the bar appears only for that case.
        const total = Number(row.total_amount) || 0;
        const paid = Number(row.paid_amount) || 0;
        const isPartial = paid > 0 && Number(row.balance_due) > 0 && total > 0;

        return (
          <div className="space-y-1">
            <span
              className={
                row.is_overdue ? "font-semibold text-destructive" : undefined
              }
            >
              {fmt.money(row.balance_due)}
            </span>
            {isPartial && (
              <div
                className="ml-auto h-1 w-16 overflow-hidden rounded-full bg-muted"
                // Decorative here: the adjacent figure already states the
                // balance, and a per-row bar announced on every row would
                // make the table tedious to hear.
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-success"
                  style={{
                    width: `${Math.min(100, Math.max(0, (paid / total) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: t.common.status,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statusVariant(row.status)}>
            {t.status[row.status as keyof typeof t.status] ?? row.status}
          </Badge>
          {/* Only a rejection is surfaced in the list. Queued and declared
              are the normal path and would double the badges on every row
              for no decision the reader has to make. */}
          {row.fiscal_status === "REJECTED" && (
            <Badge variant={fiscalVariant(row.fiscal_status)}>
              {t.invoicing.fiscal.REJECTED}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        can("invoicing.print_invoice") ? (
          <Button
            size="sm"
            variant="ghost"
            loading={downloading === row.id}
            onClick={() => void downloadPdf(row)}
            aria-label={t.invoicing.downloadPdf}
          >
            <Download className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.invoices}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.invoicing}</p>
        </div>
        {/* An invoice is raised by making a credit sale, not by typing the
            document directly: a credit sale already issues and posts one, and
            it is the only path that also moves the stock the invoice bills
            for. The separate invoice form let those two diverge, so it is gone
            and this goes to the sale screen with the type preselected. */}
        {can("invoicing.add_invoice") && can("sales.add_sale") && (
          <Button onClick={() => router.push("/sales/new?type=CREDIT")}>
            <Plus className="h-4 w-4" />
            {t.invoicing.newInvoice}
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
        onRowClick={(row) => router.push(`/invoicing/invoices/${row.id}`)}
        toolbar={
          <Select
            value={filters.filter}
            onChange={(event) => setFilter("filter", event.target.value)}
            className="w-48"
            aria-label={t.common.filter}
          >
            <option value="">{t.common.all}</option>
            <option value="unpaid">{t.dashboard.outstandingInvoices}</option>
            <option value="overdue">{t.invoicing.overdue}</option>
            <option value="draft">{t.status.DRAFT}</option>
            <option value="obr_rejected">{t.invoicing.fiscal.REJECTED}</option>
          </Select>
        }
      />
    </div>
  );
}
