"use client";

import { Ban, Wallet } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { TranslatableText } from "@/components/translatable-text";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  PageError,
  Progress,
  statusVariant,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from "@/components/ui/primitives";
import { DetailPageSkeleton } from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { SupplierInvoice } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, translateErrorDetailed, useQuery } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

/**
 * Supplier invoice detail.
 *
 * The settlement picture for one bill: what is owed, what has been paid, and
 * every payment that contributed. The allocation list is what makes "one
 * invoice, many payments" legible — each row is one instalment, and a reversed
 * one stays visible because it is part of how the balance came to be.
 */
export default function SupplierInvoiceDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const invoice = useQuery<SupplierInvoice>(
    `/purchasing/supplier-invoices/${params.id}/`,
  );

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const data = invoice.data;

  const cancel = async () => {
    if (!data || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/purchasing/supplier-invoices/${data.id}/cancel/`, {
        reason,
      });
      toast.success(t.toasts.updated, data.invoice_number);
      setCancelOpen(false);
      setReason("");
      invoice.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setBusy(false);
    }
  };

  if (invoice.loading) return <DetailPageSkeleton />;
  if (invoice.error || !data) {
    return (
      <PageError
        error={invoice.error}
        message={invoice.error ? translateError(invoice.error, t) : t.errors.not_found}
        onRetry={invoice.refetch}
        title={t.common.errorOccurred}
        retryLabel={t.common.retry}
        deniedTitle={t.common.accessDeniedTitle}
        deniedBody={t.common.accessDeniedBody}
      />
    );
  }

  const activeAllocations = data.payment_allocations.filter(
    (allocation) => !allocation.is_reversed,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">
              {data.invoice_number}
            </h1>
            <Badge variant={statusVariant(data.status)}>
              {t.status[data.status as keyof typeof t.status] ?? data.status}
            </Badge>
            {data.is_overdue && (
              <Badge variant="destructive">
                {data.days_overdue} {t.payables.daysOverdue.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.supplier_name} · {data.reference}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.is_open && can("purchasing.record_supplier_payment") && (
            <Button
              onClick={() =>
                router.push(
                  `/purchasing/supplier-payments/new?supplier=${data.supplier}&invoice=${data.id}`,
                )
              }
            >
              <Wallet className="h-4 w-4" />
              {t.payables.newPayment}
            </Button>
          )}
          {!data.is_cancelled && can("purchasing.record_supplier_invoice") && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" />
              {t.payables.cancelInvoice}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateErrorDetailed(error, t)}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.payables.paymentProgress}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress
              value={data.payment_progress}
              label={`${fmt.money(data.paid_amount)} / ${fmt.money(data.total_amount)}`}
              tone={
                Number(data.payment_progress) >= 100
                  ? "success"
                  : data.is_overdue
                    ? "danger"
                    : "default"
              }
            />

            <div className="grid grid-cols-3 gap-4 border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t.payables.totalAmount}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {fmt.money(data.total_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t.payables.paidAmount}
                </p>
                <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-500">
                  {fmt.money(data.paid_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t.payables.balanceDue}
                </p>
                <p
                  className={`text-lg font-semibold tabular-nums ${
                    Number(data.balance_due) > 0 ? "text-destructive" : ""
                  }`}
                >
                  {fmt.money(data.balance_due)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.payables.supplierInvoice}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow
              label={t.payables.internalReference}
              value={<span className="font-mono text-xs">{data.reference}</span>}
            />
            <DetailRow label={t.purchasing.supplier} value={data.supplier_name} />
            <DetailRow
              label={t.payables.invoiceDate}
              value={formatDate(data.invoice_date)}
            />
            <DetailRow
              label={t.payables.dueDate}
              value={formatDate(data.due_date)}
            />
            <DetailRow
              label={t.payables.relatedOrder}
              value={
                data.order_number ? (
                  <span className="font-mono text-xs">{data.order_number}</span>
                ) : null
              }
            />
            <DetailRow label={t.common.subtotal} value={fmt.money(data.subtotal)} />
            <DetailRow label={t.sales.tax} value={fmt.money(data.tax_amount)} />
            {Number(data.freight_cost) > 0 && (
              <DetailRow
                label={t.purchasing.freightCost}
                value={fmt.money(data.freight_cost)}
              />
            )}
            {Number(data.customs_duty) > 0 && (
              <DetailRow
                label={t.purchasing.customsDuty}
                value={fmt.money(data.customs_duty)}
              />
            )}
            {data.cancellation_reason && (
              <DetailRow
                label={t.common.reason}
                value={
                  <TranslatableText inline text={data.cancellation_reason} />
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.payables.paymentHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payment_allocations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t.payables.noPayments}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>{t.payables.paymentDate}</TH>
                    <TH>{t.payables.supplierPayment}</TH>
                    <TH>{t.payables.paymentMethod}</TH>
                    <TH numeric>{t.payables.amountPaid}</TH>
                    <TH>{t.common.status}</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.payment_allocations.map((allocation) => (
                    <TR
                      key={allocation.id}
                      onClick={() =>
                        router.push(
                          `/purchasing/supplier-payments/${allocation.payment}`,
                        )
                      }
                      className="cursor-pointer"
                    >
                      <TD>{formatDate(allocation.payment_date)}</TD>
                      <TD>
                        <span className="font-mono text-xs">
                          {allocation.payment_reference}
                        </span>
                      </TD>
                      <TD>
                        {t.paymentMethods[
                          allocation.payment_method as keyof typeof t.paymentMethods
                        ] ?? allocation.payment_method}
                      </TD>
                      <TD numeric>
                        <span
                          className={
                            allocation.is_reversed
                              ? "text-muted-foreground line-through"
                              : ""
                          }
                        >
                          {fmt.money(allocation.amount)}
                        </span>
                      </TD>
                      <TD>
                        {allocation.is_reversed ? (
                          <Badge variant="destructive">
                            {t.payables.reversed}
                          </Badge>
                        ) : (
                          <Badge variant="success">{t.status.PAID}</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {activeAllocations.length !== data.payment_allocations.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.payables.reversed}:{" "}
                  {data.payment_allocations.length - activeAllocations.length}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.payables.cancelInvoice}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {Number(data.paid_amount) > 0 && (
              <Alert variant="warning">{t.payables.invoiceHasPayments}</Alert>
            )}
            <Field label={t.common.reason}>
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              {t.common.close}
            </Button>
            <Button
              variant="destructive"
              onClick={cancel}
              loading={busy}
              disabled={!reason.trim()}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
