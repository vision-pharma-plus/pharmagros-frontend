"use client";

import { useMemo, useState } from "react";

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
  Field,
  Input,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import {
  GOODS_RETURN_REASONS,
  type CreditNoteReason,
  type Invoice,
  type InvoiceLine,
} from "@/lib/api/types";
import { translateError } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

const REASONS: CreditNoteReason[] = [
  "GOODS_RETURNED",
  "GOODS_DAMAGED",
  "WRONG_QUANTITY",
  "WRONG_PRICE",
  "DISCOUNT_GRANTED",
  "OTHER",
];

/**
 * One editable credit line, pre-filled from the invoice line it corrects.
 *
 * `quantity` is held as a string so the field can be cleared while typing;
 * an empty box means "do not credit this line" rather than zero.
 */
interface CreditLine {
  line: InvoiceLine;
  quantity: string;
  restock: boolean;
  conditionNotes: string;
}

function buildLines(invoice: Invoice): CreditLine[] {
  return invoice.lines.map((line) => ({
    line,
    // Starts empty: crediting the whole invoice is a deliberate choice, not
    // the default. Most corrections cover a single line.
    quantity: "",
    restock: false,
    conditionNotes: "",
  }));
}

/**
 * The maximum creditable quantity for a line.
 *
 * For a goods return this is what the sale line still has outstanding, since
 * units already returned cannot come back twice. For a financial correction
 * it is simply the quantity invoiced.
 */
function maxQuantity(entry: CreditLine, isReturn: boolean): number {
  const invoiced = Number(entry.line.quantity);
  if (!isReturn || entry.line.returnable_quantity === null) return invoiced;
  return Math.min(invoiced, Number(entry.line.returnable_quantity));
}

export function CreditNoteDialog({
  invoice,
  open,
  onOpenChange,
  onIssued,
}: {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (creditNoteId: string) => void;
}) {
  const t = useTranslation();
  const fmt = useFormat();

  const [reasonCode, setReasonCode] = useState<CreditNoteReason>("GOODS_RETURNED");
  const [details, setDetails] = useState("");
  const [lines, setLines] = useState<CreditLine[]>(() => buildLines(invoice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Whether this correction means physical stock came back. Only then are the
  // restock controls shown — a pricing correction has no goods to put away.
  const isReturn = GOODS_RETURN_REASONS.includes(reasonCode);
  // Restocking needs the batch allocations behind the sale, which a manually
  // raised invoice does not have.
  const canRestock = isReturn && invoice.sale !== null;

  const reset = () => {
    setLines(buildLines(invoice));
    setDetails("");
    setReasonCode("GOODS_RETURNED");
    setError(null);
  };

  const update = (index: number, patch: Partial<CreditLine>) => {
    setLines((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  };

  const selected = lines.filter((entry) => Number(entry.quantity) > 0);

  const total = useMemo(
    () =>
      selected.reduce((sum, entry) => {
        const gross = Number(entry.quantity) * Number(entry.line.unit_price);
        const net = gross * (1 - Number(entry.line.discount_percent) / 100);
        return sum + net * (1 + Number(entry.line.tax_rate) / 100);
      }, 0),
    [selected],
  );

  // A line credited beyond what was invoiced (or beyond what is still
  // returnable) would be rejected by the server; catching it here keeps the
  // quantities in front of the user while they fix them.
  const overCredited = lines.some(
    (entry) =>
      Number(entry.quantity) > 0 &&
      Number(entry.quantity) > maxQuantity(entry, isReturn),
  );

  // A goods return restocks per sale line, so every credited line must name
  // one. In practice that means lines added to the invoice by hand, after the
  // sale, cannot be part of a return.
  const missingSaleLine =
    isReturn &&
    invoice.sale !== null &&
    selected.some((entry) => entry.line.sale_line === null);

  const canSubmit =
    selected.length > 0 &&
    details.trim().length > 0 &&
    !overCredited &&
    !missingSaleLine;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const note = await api.post<Invoice>(
        `/invoicing/invoices/${invoice.id}/credit-note/`,
        {
          reason: details.trim(),
          reason_code: reasonCode,
          lines: selected.map((entry) => ({
            product: entry.line.product,
            description: entry.line.description,
            quantity: entry.quantity,
            unit_price: entry.line.unit_price,
            discount_percent: entry.line.discount_percent,
            tax_rate: entry.line.tax_rate,
            batch_numbers: entry.line.batch_numbers,
            unit_of_measure: entry.line.unit_of_measure,
            // Only meaningful on the goods-return path; the server ignores
            // them for a purely financial correction.
            sale_line: canRestock ? entry.line.sale_line : null,
            restock: canRestock && entry.restock,
            condition_notes: canRestock ? entry.conditionNotes : "",
          })),
        },
      );
      toast.success(t.invoicing.creditNoteIssued, note.invoice_number);
      onOpenChange(false);
      reset();
      onIssued(note.id);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {t.invoicing.creditNoteFor} {invoice.invoice_number}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && <Alert variant="destructive">{translateError(error, t)}</Alert>}

          <Field label={t.invoicing.creditNoteReason} required>
            <Select
              value={reasonCode}
              onChange={(event) =>
                setReasonCode(event.target.value as CreditNoteReason)
              }
            >
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {t.invoicing.creditReasons[value]}
                </option>
              ))}
            </Select>
          </Field>

          {/* Says up front that stock will not move, so nobody issues a
              returned-goods note here and then waits for an adjustment that
              is never coming. */}
          {isReturn && invoice.sale === null && (
            <Alert variant="warning">{t.invoicing.restockNotAvailable}</Alert>
          )}

          {missingSaleLine && (
            <Alert variant="destructive">{t.invoicing.creditNoteEmpty}</Alert>
          )}

          <Field label={t.invoicing.creditNoteDetails} required>
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={2}
              placeholder={t.invoicing.creditNoteReason}
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">{t.invoicing.creditNoteLines}</p>
            <Table>
              <THead>
                <TR>
                  <TH>{t.catalog.name}</TH>
                  <TH numeric>{t.common.quantity}</TH>
                  <TH numeric>{t.sales.unitPrice}</TH>
                  <TH numeric>{t.invoicing.creditNoteQuantity}</TH>
                  {canRestock && <TH>{t.invoicing.restock}</TH>}
                </TR>
              </THead>
              <TBody>
                {lines.map((entry, index) => {
                  const limit = maxQuantity(entry, isReturn);
                  const over = Number(entry.quantity) > limit;
                  return (
                    <TR key={entry.line.id}>
                      <TD>
                        <p className="font-medium">{entry.line.description}</p>
                        {entry.line.batch_numbers && (
                          <p className="text-xs text-muted-foreground">
                            {t.inventory.batchNumber}: {entry.line.batch_numbers}
                          </p>
                        )}
                        {/* Shown only when it differs from the invoiced
                            quantity — otherwise it is noise on every row. */}
                        {isReturn &&
                          entry.line.returnable_quantity !== null &&
                          Number(entry.line.returnable_quantity) <
                            Number(entry.line.quantity) && (
                            <p className="text-xs text-muted-foreground">
                              {t.invoicing.returnableQuantity}:{" "}
                              {fmt.quantity(
                                entry.line.returnable_quantity,
                                entry.line.unit_of_measure,
                              )}
                            </p>
                          )}
                      </TD>
                      <TD numeric>
                        {fmt.quantity(
                          entry.line.quantity,
                          entry.line.unit_of_measure,
                        )}
                      </TD>
                      <TD numeric>{fmt.money(entry.line.unit_price)}</TD>
                      <TD numeric>
                        <Input
                          type="number"
                          min="0"
                          max={limit}
                          step="0.001"
                          inputMode="decimal"
                          aria-invalid={over}
                          aria-label={`${t.invoicing.creditNoteQuantity} — ${entry.line.description}`}
                          className={`w-28 text-right ${over ? "border-destructive" : ""}`}
                          value={entry.quantity}
                          onChange={(event) =>
                            update(index, { quantity: event.target.value })
                          }
                        />
                      </TD>
                      {canRestock && (
                        <TD>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-input"
                              // Only offered on lines actually being credited,
                              // and only where a sale line exists to restock into.
                              disabled={
                                Number(entry.quantity) <= 0 ||
                                entry.line.sale_line === null
                              }
                              checked={entry.restock}
                              onChange={(event) =>
                                update(index, { restock: event.target.checked })
                              }
                            />
                            {t.invoicing.restock}
                          </label>
                          {entry.restock && (
                            <Input
                              className="mt-2"
                              placeholder={t.invoicing.conditionNotes}
                              aria-label={`${t.invoicing.conditionNotes} — ${entry.line.description}`}
                              value={entry.conditionNotes}
                              onChange={(event) =>
                                update(index, { conditionNotes: event.target.value })
                              }
                            />
                          )}
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          {overCredited && (
            <Alert variant="destructive">{t.invoicing.creditNoteExceedsLine}</Alert>
          )}

          {/* The restock decision is a patient-safety one, so the rule behind
              it is stated where it is being made rather than in a manual. */}
          {canRestock && <Alert variant="warning">{t.invoicing.restockHint}</Alert>}

          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
            <span>{t.invoicing.creditNoteAmount}</span>
            <span className="tabular-nums">{fmt.money(total)}</span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button disabled={!canSubmit} loading={saving} onClick={() => void submit()}>
            {t.invoicing.issueCreditNote}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
