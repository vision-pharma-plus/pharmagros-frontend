"use client";

import { Ban, Check, Pencil, Trash2, Wallet } from "lucide-react";
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
  Input,
  Select,
  Textarea,
  statusVariant,
} from "@/components/ui/primitives";
import { DetailPageSkeleton } from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { Expense } from "@/lib/api/types";
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

export default function ExpenseDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const expense = useQuery<Expense>(`/accounting/expenses/${params.id}/`);

  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [payMethod, setPayMethod] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const data = expense.data;

  const act = async (
    action: string,
    body: Record<string, unknown> = {},
    after?: () => void,
  ) => {
    if (!data) return;
    setBusy(action);
    setError(null);
    try {
      await api.post(`/accounting/expenses/${data.id}/${action}/`, body);
      toast.success(t.toasts.updated, data.reference);
      after?.();
      expense.refetch();
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!data) return;
    setBusy("delete");
    setError(null);
    try {
      await api.delete(`/accounting/expenses/${data.id}/`);
      toast.success(t.toasts.deleted, data.reference);
      router.push("/accounting/expenses");
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
      setBusy(null);
      setDeleteOpen(false);
    }
  };

  if (expense.loading) return <DetailPageSkeleton />;
  if (expense.error || !data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {expense.error ? translateError(expense.error, t) : t.errors.not_found}
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{data.description}</h1>
            <Badge variant={statusVariant(data.status)}>
              {t.status[data.status as keyof typeof t.status] ?? data.status}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {data.reference} · {data.category_name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.is_editable && can("accounting.change_expense") && (
            <Button
              variant="secondary"
              onClick={() =>
                router.push(`/accounting/expenses/${data.id}/edit`)
              }
            >
              <Pencil className="h-4 w-4" />
              {t.common.edit}
            </Button>
          )}
          {(data.status === "DRAFT" || data.status === "RECORDED") &&
            can("accounting.approve_expense") && (
              <Button
                variant="secondary"
                onClick={() => act("approve")}
                loading={busy === "approve"}
              >
                <Check className="h-4 w-4" />
                {t.accounting.approve}
              </Button>
            )}
          {!data.is_paid &&
            data.status !== "CANCELLED" &&
            can("accounting.change_expense") && (
              <Button onClick={() => setPayOpen(true)}>
                <Wallet className="h-4 w-4" />
                {t.accounting.markPaid}
              </Button>
            )}
          {data.status !== "CANCELLED" && can("accounting.change_expense") && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" />
              {t.accounting.cancelExpense}
            </Button>
          )}
          {!data.is_paid && can("accounting.delete_expense") && (
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {t.common.delete}
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
            <CardTitle>{t.accounting.expense}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label={t.accounting.category} value={data.category_name} />
            <DetailRow
              label={t.accounting.expenseDate}
              value={formatDate(data.expense_date)}
            />
            <DetailRow
              label={t.accounting.paidDate}
              value={data.paid_date ? formatDate(data.paid_date) : null}
            />
            <DetailRow label={t.accounting.payee} value={data.payee} />
            <DetailRow
              label={t.accounting.relatedSupplier}
              value={data.supplier_name}
            />
            <DetailRow
              label={t.accounting.relatedOrder}
              value={
                data.order_number ? (
                  <span className="font-mono text-xs">{data.order_number}</span>
                ) : null
              }
            />
            <DetailRow
              label={t.payables.paymentMethod}
              value={
                t.paymentMethods[
                  data.payment_method as keyof typeof t.paymentMethods
                ] ?? data.payment_method
              }
            />
            <DetailRow
              label={t.payables.paymentReference}
              value={data.payment_reference}
            />
            <DetailRow
              label={t.accounting.receiptNumber}
              value={data.receipt_number}
            />
            <DetailRow
              label={t.accounting.recordedBy}
              value={data.recorded_by_name}
            />
            {data.approved_by_name && (
              <DetailRow
                label={t.accounting.approvedBy}
                value={data.approved_by_name}
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

            {data.notes && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  {t.accounting.notes}
                </p>
                <TranslatableText text={data.notes} className="text-sm" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.accounting.amount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {fmt.money(data.amount)}
            </p>
            <div className="mt-3 border-t border-border pt-3">
              <DetailRow
                label={t.accounting.taxAmount}
                value={fmt.money(data.tax_amount)}
              />
              <DetailRow
                label={t.accounting.netAmount}
                value={fmt.money(data.net_amount)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.accounting.markPaid}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label={t.accounting.paidDate}>
              <Input
                type="date"
                value={paidDate}
                onChange={(event) => setPaidDate(event.target.value)}
              />
            </Field>
            <Field label={t.payables.paymentMethod}>
              <Select
                value={payMethod}
                onChange={(event) => setPayMethod(event.target.value)}
              >
                {Object.entries(t.paymentMethods).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.payables.paymentReference}>
              <Input
                value={payReference}
                onChange={(event) => setPayReference(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={() =>
                act(
                  "mark-paid",
                  {
                    paid_date: paidDate,
                    payment_method: payMethod,
                    payment_reference: payReference,
                  },
                  () => setPayOpen(false),
                )
              }
              loading={busy === "mark-paid"}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.accounting.cancelExpense}</DialogTitle>
          </DialogHeader>
          <DialogBody>
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
              onClick={() =>
                act("cancel", { reason }, () => {
                  setCancelOpen(false);
                  setReason("");
                })
              }
              loading={busy === "cancel"}
              disabled={!reason.trim()}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.common.delete}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">{data.reference}</p>
          </DialogBody>
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
    </div>
  );
}
