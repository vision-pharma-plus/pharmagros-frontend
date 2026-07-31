"use client";

import { useState } from "react";

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
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { StockBatch } from "@/lib/api/types";
import { formatQuantity, money } from "@/lib/format";
import { translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Stocktake adjustment.
 *
 * The reason field is mandatory and the submit button stays disabled without
 * it — mirroring the backend rule. An unexplained inventory adjustment is
 * exactly what an auditor investigates for diversion, so the UI should make
 * supplying a reason feel obligatory rather than incidental.
 */
export function StockAdjustDialog({
  batch,
  open,
  onOpenChange,
  onAdjusted,
}: {
  batch: StockBatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted: () => void;
}) {
  const t = useTranslation();
  const [countedQuantity, setCountedQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const reset = () => {
    setCountedQuantity("");
    setReason("");
    setNotes("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const delta =
    batch && countedQuantity
      ? money.subtract(countedQuantity, batch.quantity_remaining)
      : null;

  // A count that matches the system quantity is a legitimate stocktake result,
  // not an invalid form. The backend treats it as a no-op, so the dialog lets
  // it through and simply reports that there was no discrepancy.
  const noDiscrepancy = delta !== null && money.isZero(delta);

  const canSubmit =
    batch !== null &&
    countedQuantity !== "" &&
    Number(countedQuantity) >= 0 &&
    reason.trim().length > 0;

  const submit = async () => {
    if (!batch) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/inventory/batches/${batch.id}/adjust/`, {
        new_quantity: countedQuantity,
        reason: reason.trim(),
        notes,
      });
      toast.success(
        noDiscrepancy ? t.inventory.noDiscrepancies : t.toasts.stockAdjusted,
        `${batch.product_name} · ${formatQuantity(countedQuantity)}`,
      );
      reset();
      onOpenChange(false);
      onAdjusted();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const errorMessage = translateError(error, t);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.inventory.adjustStock}</DialogTitle>
          <DialogDescription>
            {batch
              ? `${batch.product_name} · ${batch.batch_number}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">{errorMessage}</Alert>
          )}

          {batch && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t.inventory.quantityRemaining}
                </span>
                <span className="font-medium tabular-nums">
                  {formatQuantity(batch.quantity_remaining)}
                </span>
              </div>
            </div>
          )}

          <Field label={t.inventory.countedQuantity} required>
            <Input
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={countedQuantity}
              onChange={(event) => setCountedQuantity(event.target.value)}
              autoFocus
            />
          </Field>

          {delta &&
            (noDiscrepancy ? (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                {t.inventory.noDiscrepancies}
              </div>
            ) : (
              <div
                className={`rounded-md p-3 text-sm ${
                  money.isNegative(delta)
                    ? "bg-destructive/10 text-destructive"
                    : "bg-success/10 text-success"
                }`}
              >
                <span className="font-medium tabular-nums">
                  {money.isNegative(delta) ? "" : "+"}
                  {formatQuantity(delta)}
                </span>
              </div>
            ))}

          <Field
            label={t.common.reason}
            required
            hint={t.inventory.adjustmentReasonRequired}
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </Field>

          <Field label={t.common.notes}>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            disabled={!canSubmit}
            loading={submitting}
            onClick={() => void submit()}
          >
            {t.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
