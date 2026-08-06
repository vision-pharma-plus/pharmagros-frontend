"use client";

import { Ban, Pencil, Trash2 } from "lucide-react";
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
  PageError,
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
import type { Sale } from "@/lib/api/types";
import { formatDate, formatDateTime, money } from "@/lib/format";
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
 * Sale detail: what the sale says, and what can still be done to it.
 *
 * Read-only by design. Editing a draft reopens the sale creation form with
 * everything restored (`/sales/new?draft=<id>`), because that form is where a
 * sale is built and resuming one is the same task as entering it. Keeping a
 * second line editor here would mean two implementations of discount, VAT and
 * price handling that would drift apart.
 *
 * What this page owns is the lifecycle: delete a draft that was abandoned,
 * cancel a confirmed sale (which reverses its stock), and read the batches
 * that were issued.
 */
export default function SaleDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const sale = useQuery<Sale>(`/sales/sales/${params.id}/`);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const data = sale.data;
  const isDraft = data?.status === "DRAFT";

  const canEdit = can("sales.change_sale");
  const canDelete = can("sales.cancel_sale");

  const remove = async () => {
    if (!data) return;
    setBusy("delete");
    setError(null);
    try {
      await api.delete(`/sales/sales/${data.id}/`);
      toast.success(t.sales.draftDeleted, data.sale_number);
      router.push("/sales");
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
      setBusy(null);
      setDeleteOpen(false);
    }
  };

  const cancel = async () => {
    if (!data || !cancelReason.trim()) return;
    setBusy("cancel");
    setError(null);
    try {
      await api.post(`/sales/sales/${data.id}/cancel/`, { reason: cancelReason });
      toast.success(t.toasts.updated, data.sale_number);
      setCancelOpen(false);
      setCancelReason("");
      sale.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setBusy(null);
    }
  };

  if (sale.loading) return <DetailPageSkeleton />;
  if (sale.error || !data) {
    return (
      <PageError
        error={sale.error}
        message={sale.error ? translateError(sale.error, t) : t.errors.not_found}
        onRetry={sale.refetch}
        title={t.common.errorOccurred}
        retryLabel={t.common.retry}
        deniedTitle={t.common.accessDeniedTitle}
        deniedBody={t.common.accessDeniedBody}
      />
    );
  }

  const isVoidable =
    data.status !== "CANCELLED" && data.status !== "RETURNED" && !isDraft;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">
              {data.sale_number}
            </h1>
            <Badge variant={statusVariant(data.status)}>
              {t.status[data.status as keyof typeof t.status] ?? data.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.customer_name} · {formatDate(data.sale_date)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button
                variant="secondary"
                // Reopens the creation form with this draft restored, so the
                // operator continues exactly where they left off.
                onClick={() => router.push(`/sales/new?draft=${data.id}`)}
                disabled={!canEdit}
                title={canEdit ? undefined : t.permissions.editSaleNotAllowed}
              >
                <Pencil className="h-4 w-4" />
                {t.sales.editDraft}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={!canDelete}
                title={canDelete ? undefined : t.permissions.deleteSaleNotAllowed}
              >
                <Trash2 className="h-4 w-4" />
                {t.sales.deleteDraft}
              </Button>
            </>
          )}
          {isVoidable && (
            <Button
              variant="destructive"
              onClick={() => setCancelOpen(true)}
              disabled={!can("sales.cancel_sale")}
            >
              <Ban className="h-4 w-4" />
              {t.sales.cancelSale}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateErrorDetailed(error, t)}
        </Alert>
      )}

      {isDraft && <Alert>{t.sales.draftNotConfirmedHint}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.sales.saleLines}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t.sales.noLines}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>{t.nav.medicines}</TH>
                      <TH numeric>{t.common.quantity}</TH>
                      <TH numeric>{t.sales.unitPrice}</TH>
                      <TH numeric>{t.sales.discount}</TH>
                      <TH numeric>{t.sales.lineTotal}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.lines.map((line) => (
                      <TR key={line.id}>
                        <TD>
                          <p className="font-medium">{line.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.product_code}
                          </p>
                          {line.batch_allocations.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t.sales.batchesIssued}:{" "}
                              {line.batch_allocations
                                .map((batch) => batch.batch_number)
                                .join(", ")}
                            </p>
                          )}
                        </TD>
                        <TD numeric>{line.quantity}</TD>
                        <TD numeric>{fmt.money(line.unit_price)}</TD>
                        <TD numeric>
                          {Number(line.discount_percent) > 0
                            ? `${line.discount_percent}%`
                            : "—"}
                        </TD>
                        <TD numeric>{fmt.money(line.line_total)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t.common.total}</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailRow
                label={t.common.subtotal}
                value={fmt.money(data.subtotal)}
              />
              <DetailRow
                label={t.sales.discount}
                value={
                  money.isZero(data.discount_amount)
                    ? "—"
                    : `− ${fmt.money(data.discount_amount)}`
                }
              />
              <DetailRow label={t.sales.tax} value={fmt.money(data.tax_amount)} />
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>{t.sales.grandTotal}</span>
                <span>{fmt.money(data.total_amount)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.sales.sale}</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailRow label={t.sales.customer} value={data.customer_name} />
              <DetailRow
                label={t.sales.saleType}
                value={
                  data.sale_type === "CREDIT"
                    ? t.sales.creditSale
                    : t.sales.cashSale
                }
              />
              <DetailRow
                label={t.common.date}
                value={formatDateTime(data.sale_date)}
              />
              <DetailRow
                label={t.sales.salesperson}
                value={data.salesperson_name}
              />
              <DetailRow
                label={t.invoicing.reference}
                value={data.customer_order_reference}
              />
              {data.invoice_number && (
                <DetailRow
                  label={t.invoicing.invoiceNumber}
                  value={
                    <span className="font-mono text-xs">
                      {data.invoice_number}
                    </span>
                  }
                />
              )}
              {data.confirmed_at && (
                <DetailRow
                  label={t.status.CONFIRMED}
                  value={formatDateTime(data.confirmed_at)}
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

          {data.notes && (
            <Card>
              <CardHeader>
                <CardTitle>{t.common.notes}</CardTitle>
              </CardHeader>
              <CardContent>
                <TranslatableText
                  text={data.notes}
                  className="text-sm text-muted-foreground"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.sales.deleteDraft}</DialogTitle>
            <DialogDescription>
              {t.sales.deleteDraftConfirm.replace("%{number}", data.sale_number)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              loading={busy === "delete"}
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.sales.cancelSale}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field label={t.common.reason}>
              <Textarea
                rows={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
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
              loading={busy === "cancel"}
              disabled={!cancelReason.trim()}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
