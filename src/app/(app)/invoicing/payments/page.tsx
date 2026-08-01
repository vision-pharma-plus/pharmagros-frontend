"use client";

import { Plus, Undo2 } from "lucide-react";
import { useState } from "react";

import { DataTable, type Column } from "@/components/data-table";
import { EntityPicker } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  Badge,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { CustomerListItem, Payment } from "@/lib/api/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  translateError,
  useDebounced,
  usePaginatedQuery,
  useUrlFilters,
} from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

/** Mirrors `apps.invoicing.models.PaymentMethod`. */
const METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "MOBILE_MONEY",
  "CARD",
  "OTHER",
] as const;

export default function PaymentsPage() {
  const t = useTranslation();
  const can = useAuth((state) => state.can);
  const { filters, setFilter, clearFilters, isFiltered } = useUrlFilters({
    search: "",
    method: "",
  });
  const debouncedSearch = useDebounced(filters.search);

  const query = usePaginatedQuery<Payment>("/invoicing/payments/", {
    search: debouncedSearch || undefined,
    method: filters.method || undefined,
  });

  const [recordOpen, setRecordOpen] = useState(false);
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const canRecord = can("invoicing.record_payment");

  const openRecord = () => {
    setCustomer(null);
    setAmount("");
    setMethod("CASH");
    setBankReference("");
    setNotes("");
    setError(null);
    setRecordOpen(true);
  };

  const record = async () => {
    if (!customer) return;
    setSaving(true);
    setError(null);
    try {
      // invoice_ids is omitted deliberately: the backend then allocates
      // oldest-due-first, which is the convention the finance team expects.
      await api.post("/invoicing/payments/", {
        customer: customer.id,
        amount,
        method,
        bank_reference: bankReference,
        notes,
      });
      toast.success(t.toasts.paymentRecorded);
      setRecordOpen(false);
      query.refetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSaving(false);
    }
  };

  const reverse = async () => {
    if (!reversing) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/invoicing/payments/${reversing.id}/reverse/`, {
        reason: reason.trim(),
      });
      toast.success(t.invoicing.reversePayment, reversing.reference);
      setReversing(null);
      query.refetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Payment>[] = [
    {
      key: "reference",
      header: t.invoicing.paymentReference,
      render: (row) => (
        <div className="min-w-0">
          <span className="font-mono text-xs">{row.reference}</span>
          {row.is_reversed && (
            <Badge variant="destructive" className="ml-1.5">
              {t.invoicing.reversed}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "date",
      header: t.invoicing.paymentDate,
      render: (row) => (
        <span className="whitespace-nowrap">
          {formatDateTime(row.payment_date)}
        </span>
      ),
    },
    {
      key: "customer",
      header: t.nav.customers,
      render: (row) => (
        <div className="min-w-0">
          <span className="truncate font-medium">{row.customer_name}</span>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {row.customer_code}
          </p>
        </div>
      ),
    },
    {
      key: "method",
      header: t.invoicing.paymentMethod,
      render: (row) => (
        <Badge variant="secondary">
          {t.paymentMethods[row.method as keyof typeof t.paymentMethods] ??
            row.method}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: t.invoicing.amountReceived,
      numeric: true,
      render: (row) => (
        <span className="font-medium">{formatMoney(row.amount)}</span>
      ),
    },
    {
      key: "allocated",
      header: t.invoicing.allocatedAmount,
      numeric: true,
      render: (row) => formatMoney(row.allocated_amount),
    },
    {
      key: "unallocated",
      header: t.invoicing.unallocatedAmount,
      numeric: true,
      render: (row) => (
        // Money received but not yet applied to an invoice is what a
        // reconciliation is looking for, so it is highlighted.
        <span
          className={
            Number(row.unallocated_amount) > 0
              ? "font-semibold text-warning"
              : undefined
          }
        >
          {formatMoney(row.unallocated_amount)}
        </span>
      ),
    },
    ...(canRecord
      ? [
          {
            key: "actions",
            header: t.common.actions,
            render: (row: Payment) =>
              row.is_reversed ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.invoicing.reversePayment}
                    onClick={() => {
                      setReason("");
                      setError(null);
                      setReversing(row);
                    }}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
          } satisfies Column<Payment>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.payments}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.invoicing}</p>
        </div>
        {canRecord && (
          <Button onClick={openRecord}>
            <Plus className="h-4 w-4" />
            {t.invoicing.recordPayment}
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
        toolbar={
          <Select
            aria-label={t.invoicing.paymentMethod}
            value={filters.method}
            onChange={(event) => setFilter("method", event.target.value)}
            className="w-auto"
          >
            <option value="">{t.common.all}</option>
            {METHODS.map((item) => (
              <option key={item} value={item}>
                {t.paymentMethods[item as keyof typeof t.paymentMethods] ?? item}
              </option>
            ))}
          </Select>
        }
      />

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.invoicing.recordPayment}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}

            <Field label={t.nav.customers} required>
              <EntityPicker<CustomerListItem>
                path="/partners/customers/"
                value={customer}
                onChange={setCustomer}
                getKey={(item) => item.id}
                getLabel={(item) => item.business_name}
                getSublabel={(item) => item.customer_code}
                createResource="customer"
              />
            </Field>

            <Field label={`${t.invoicing.amountReceived} (BIF)`} required>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>

            <Field label={t.invoicing.paymentMethod} required>
              <Select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {METHODS.map((item) => (
                  <option key={item} value={item}>
                    {t.paymentMethods[item as keyof typeof t.paymentMethods] ??
                      item}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t.invoicing.bankReference}>
              <Input
                value={bankReference}
                onChange={(event) => setBankReference(event.target.value)}
              />
            </Field>

            <Field label={t.common.notes}>
              <Textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={record}
              loading={saving}
              disabled={!customer || Number(amount) <= 0}
            >
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reversing !== null}
        onOpenChange={(next) => !next && setReversing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.invoicing.reversePayment}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}
            <Alert variant="warning">
              {reversing?.reference} &middot; {formatMoney(reversing?.amount ?? "0")}
            </Alert>
            <Field label={t.invoicing.reversalReason} required>
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversing(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={reverse}
              loading={saving}
              disabled={reason.trim().length === 0}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
