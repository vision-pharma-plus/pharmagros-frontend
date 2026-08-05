"use client";

import { PackageCheck, Pencil, Send } from "lucide-react";
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
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  statusVariant,
} from "@/components/ui/primitives";
import {
  DetailPageSkeleton,
  TableCardSkeleton,
} from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { PurchaseOrder } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
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

/** Actions that require a written reason before the server will accept them. */
type ReasonAction = "reject" | "cancel";

/**
 * Purchase order detail.
 *
 * Target destination of the approval-request notification, so the approve and
 * reject actions live here rather than on the list — an approver arriving from
 * a notification must be able to read the order and act on it in one place.
 */
export default function PurchaseOrderDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);
  const currentUserId = useAuth((state) => state.user?.id);

  const order = useQuery<PurchaseOrder>(`/purchasing/orders/${params.id}/`);

  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const post = async (action: string, body: Record<string, string> = {}) => {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/purchasing/orders/${params.id}/${action}/`, body);
      toast.success(t.toasts.updated, order.data?.order_number);
      setApproveOpen(false);
      setReasonAction(null);
      setReason("");
      setNotes("");
      order.refetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setBusy(null);
    }
  };

  if (order.loading) {
    // General info beside the totals card, then the line-items table. The
    // header carries a status badge and the workflow action buttons.
    return (
      <DetailPageSkeleton
        cards={[8, 8]}
        back={false}
        badges={1}
        actions={3}
      >
        <TableCardSkeleton columns={6} rows={5} />
      </DetailPageSkeleton>
    );
  }

  if (order.error || !order.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(order.error, t)}
      </Alert>
    );
  }

  const data = order.data;
  const errorMessage = translateError(error, t);

  /**
   * Separation of duties, surfaced before the click.
   *
   * The server refuses self-approval outright; mirroring the rule here means
   * the requester sees why the button is unavailable rather than being told
   * only after submitting.
   */
  const selfApprovalBlocked =
    Boolean(currentUserId) && data.requested_by === currentUserId;

  const canApprove =
    can("purchasing.approve_order") && data.status === "PENDING_APPROVAL";
  const canSubmit =
    can("purchasing.submit_order") &&
    (data.status === "DRAFT" || data.status === "REJECTED");
  const canMarkSent =
    can("purchasing.approve_order") && data.status === "APPROVED";
  const canCancel =
    can("purchasing.cancel_order") &&
    !["RECEIVED", "CANCELLED", "CLOSED"].includes(data.status);
  const canReceive = can("purchasing.receive_goods") && data.can_receive;
  // DRAFT and REJECTED only — the service refuses anything that already
  // carries an approval, since editing it would invalidate the signature.
  const canEdit = can("purchasing.add_order") && data.is_editable;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{data.order_number}</h1>
            <Badge variant={statusVariant(data.status)}>
              {t.status[data.status as keyof typeof t.status] ?? data.status}
            </Badge>
            {data.is_overdue && (
              <Badge variant="destructive">{t.invoicing.overdue}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{data.supplier_name}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push("/purchasing/orders")}>
            {t.common.back}
          </Button>

          {canEdit && (
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/purchasing/orders/${params.id}/edit`)
              }
            >
              <Pencil className="h-4 w-4" />
              {t.common.edit}
            </Button>
          )}

          {canSubmit && (
            <Button
              loading={busy === "submit"}
              onClick={() => void post("submit")}
            >
              {t.purchasing.submitForApproval}
            </Button>
          )}

          {canApprove && (
            <>
              <Button
                variant="outline"
                onClick={() => setReasonAction("reject")}
              >
                {t.purchasing.reject}
              </Button>
              <Button
                disabled={selfApprovalBlocked}
                onClick={() => setApproveOpen(true)}
              >
                {t.purchasing.approve}
              </Button>
            </>
          )}

          {canMarkSent && (
            <Button
              variant="outline"
              loading={busy === "mark-sent"}
              onClick={() => void post("mark-sent")}
            >
              <Send className="h-4 w-4" />
              {t.purchasing.markSent}
            </Button>
          )}

          {canReceive && (
            <Button
              onClick={() =>
                router.push(`/inventory/receive?order=${params.id}`)
              }
            >
              <PackageCheck className="h-4 w-4" />
              {t.purchasing.receiveGoods}
            </Button>
          )}

          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => setReasonAction("cancel")}
            >
              {t.common.cancel}
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {errorMessage}
        </Alert>
      )}

      {canApprove && selfApprovalBlocked && (
        <Alert title={t.purchasing.approve}>
          {t.purchasing.separationOfDuties}
        </Alert>
      )}

      {data.status === "REJECTED" && data.rejection_reason && (
        <Alert variant="destructive" title={t.status.REJECTED}>
          <TranslatableText inline text={data.rejection_reason} />
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.generalInfo}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow label={t.purchasing.supplier} value={data.supplier_name} />
            <DetailRow label={t.inventory.warehouse} value={data.warehouse_code} />
            <DetailRow
              label={t.purchasing.orderDate}
              value={formatDate(data.order_date)}
            />
            <DetailRow
              label={t.purchasing.expectedDelivery}
              value={formatDate(data.expected_delivery_date)}
            />
            <DetailRow
              label={t.purchasing.actualDelivery}
              value={formatDate(data.actual_delivery_date)}
            />
            <DetailRow
              label={t.purchasing.supplierInvoice}
              value={data.supplier_invoice_number}
            />
            <DetailRow
              label={t.purchasing.requestedBy}
              value={data.requested_by_name}
            />
            <DetailRow
              label={t.purchasing.approvedBy}
              value={
                data.approved_by_name
                  ? `${data.approved_by_name} · ${formatDate(data.approved_at)}`
                  : ""
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.common.total}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow
              label={t.common.subtotal}
              value={fmt.money(data.subtotal)}
            />
            <DetailRow
              label={t.sales.discount}
              value={fmt.money(data.discount_amount)}
            />
            <DetailRow
              label={t.sales.tax}
              value={fmt.money(data.tax_amount)}
            />
            <DetailRow
              label={t.purchasing.freightCost}
              value={fmt.money(data.freight_cost)}
            />
            <DetailRow
              label={t.purchasing.customsDuty}
              value={fmt.money(data.customs_duty)}
            />
            <DetailRow
              label={t.purchasing.otherCharges}
              value={fmt.money(data.other_charges)}
            />
            {/* Landed total is the figure that reaches batch cost, so it is
                separated from the goods-only total above it. */}
            <DetailRow
              label={t.inventory.landedCost}
              value={fmt.money(data.landed_cost_total)}
            />
            <DetailRow
              label={t.common.total}
              value={
                <span className="text-base">
                  {fmt.money(data.total_amount)}
                </span>
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.sections.lineItems}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>{t.catalog.name}</TH>
                <TH numeric>{t.purchasing.quantityOrdered}</TH>
                <TH numeric>{t.purchasing.quantityReceived}</TH>
                <TH numeric>{t.purchasing.quantityOutstanding}</TH>
                <TH numeric>{t.catalog.unitCost}</TH>
                <TH numeric>{t.common.total}</TH>
              </TR>
            </THead>
            <TBody>
              {data.lines.map((line) => (
                <TR key={line.id}>
                  <TD>
                    <p className="font-medium">{line.product_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {line.product_code}
                    </p>
                  </TD>
                  <TD numeric>{fmt.quantity(line.quantity_ordered)}</TD>
                  <TD numeric>{fmt.quantity(line.quantity_received)}</TD>
                  <TD numeric>
                    <span
                      className={
                        Number(line.quantity_outstanding) > 0
                          ? "font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {fmt.quantity(line.quantity_outstanding)}
                    </span>
                  </TD>
                  <TD numeric>{fmt.money(line.unit_cost)}</TD>
                  <TD numeric>{fmt.money(line.line_total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.purchasing.approve}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {errorMessage && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {errorMessage}
              </Alert>
            )}
            <p className="text-sm">
              {data.order_number} · {fmt.money(data.total_amount)}
            </p>
            <Field label={t.common.notes}>
              <Textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              loading={busy === "approve"}
              onClick={() => void post("approve", { notes: notes.trim() })}
            >
              {t.purchasing.approve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reasonAction !== null}
        onOpenChange={(next) => {
          if (!next) {
            setReasonAction(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonAction === "reject"
                ? t.purchasing.reject
                : t.common.cancel}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {errorMessage && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {errorMessage}
              </Alert>
            )}
            {/* The server rejects a blank reason, so the field is required
                here too — the requester needs to know what to correct. */}
            <Field label={t.common.reason} required>
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonAction(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim() === ""}
              loading={busy === reasonAction}
              onClick={() =>
                void post(reasonAction ?? "reject", { reason: reason.trim() })
              }
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
