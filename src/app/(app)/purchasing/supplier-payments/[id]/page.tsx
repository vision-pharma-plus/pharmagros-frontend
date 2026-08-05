"use client";

import { Undo2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { TranslatableText } from "@/components/translatable-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
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
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  statusVariant,
} from "@/components/ui/primitives";
import { DetailPageSkeleton } from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { SupplierPayment } from "@/lib/api/types";
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

export default function SupplierPaymentDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const payment = useQuery<SupplierPayment>(
    `/purchasing/supplier-payments/${params.id}/`,
  );

  const [reverseOpen, setReverseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const data = payment.data;

  const reverse = async () => {
    if (!data || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/purchasing/supplier-payments/${data.id}/reverse/`, {
        reason,
      });
      toast.success(t.toasts.updated, data.reference);
      setReverseOpen(false);
      setReason("");
      payment.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setBusy(false);
    }
  };

  if (payment.loading) return <DetailPageSkeleton />;
  if (payment.error || !data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {payment.error ? translateError(payment.error, t) : t.errors.not_found}
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">{data.reference}</h1>
            {data.is_reversed ? (
              <Badge variant="destructive">{t.payables.reversed}</Badge>
            ) : (
              <Badge variant="success">{t.status.PAID}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.supplier_name} · {formatDate(data.payment_date)}
          </p>
        </div>

        {!data.is_reversed && can("purchasing.reverse_supplier_payment") && (
          <Button variant="destructive" onClick={() => setReverseOpen(true)}>
            <Undo2 className="h-4 w-4" />
            {t.payables.reversePayment}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateErrorDetailed(error, t)}
        </Alert>
      )}

      {data.is_reversed && (
        <Alert variant="warning" title={t.payables.reversed}>
          <TranslatableText inline text={data.reversal_reason} />
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.payables.allocations}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.allocations.length === 0 ? (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {t.payables.noPayments}
                </p>
                <p className="text-sm">{t.payables.unallocatedHint}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>{t.payables.invoiceNumber}</TH>
                      <TH>{t.payables.internalReference}</TH>
                      <TH numeric>{t.payables.allocatedAmount}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.allocations.map((allocation) => (
                      <TR
                        key={allocation.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/purchasing/supplier-invoices/${allocation.supplier_invoice}`,
                          )
                        }
                      >
                        <TD>
                          <span className="font-mono text-xs font-medium">
                            {allocation.invoice_number}
                          </span>
                        </TD>
                        <TD>
                          <span className="font-mono text-xs text-muted-foreground">
                            {allocation.invoice_reference}
                          </span>
                        </TD>
                        <TD numeric>{fmt.money(allocation.amount)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}

            <div className="mt-4 space-y-1 border-t border-border pt-3">
              <DetailRow
                label={t.payables.amountPaid}
                value={fmt.money(data.amount)}
              />
              <DetailRow
                label={t.payables.allocatedAmount}
                value={fmt.money(data.allocated_amount)}
              />
              <DetailRow
                label={t.payables.unallocatedAmount}
                value={
                  Number(data.unallocated_amount) > 0 ? (
                    <span className="text-amber-600 dark:text-amber-500">
                      {fmt.money(data.unallocated_amount)}
                    </span>
                  ) : (
                    fmt.money(data.unallocated_amount)
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.payables.supplierPayment}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label={t.purchasing.supplier} value={data.supplier_name} />
            <DetailRow
              label={t.payables.paymentDate}
              value={formatDate(data.payment_date)}
            />
            <DetailRow
              label={t.payables.paymentMethod}
              value={
                t.paymentMethods[data.method as keyof typeof t.paymentMethods] ??
                data.method
              }
            />
            <DetailRow
              label={t.payables.paymentReference}
              value={
                data.payment_reference ? (
                  <span className="font-mono text-xs">
                    {data.payment_reference}
                  </span>
                ) : null
              }
            />
            <DetailRow
              label={t.payables.bankReference}
              value={
                data.bank_reference ? (
                  <span className="font-mono text-xs">{data.bank_reference}</span>
                ) : null
              }
            />
            <DetailRow
              label={t.payables.bankAccount}
              value={data.bank_account}
            />
            <DetailRow label={t.payables.paidBy} value={data.paid_by_name} />
            {data.notes && (
              <div className="mt-2 border-t border-border pt-2">
                <p className="text-xs text-muted-foreground">{t.common.notes}</p>
                <TranslatableText text={data.notes} className="text-sm" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.payables.reversePayment}</DialogTitle>
            <DialogDescription>
              {t.payables.unallocatedHint}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={t.payables.reversalReason}>
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReverseOpen(false)}>
              {t.common.close}
            </Button>
            <Button
              variant="destructive"
              onClick={reverse}
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
