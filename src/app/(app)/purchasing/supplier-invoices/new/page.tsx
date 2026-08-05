"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EntityPicker } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { PurchaseOrderListItem, SupplierInvoice, Supplier } from "@/lib/api/types";
import { money } from "@/lib/format";
import { translateErrorDetailed } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

/**
 * Record a bill received from a supplier.
 *
 * The total is derived from the components as they are typed, but stays
 * editable: the supplier's stated total is authoritative even where it does
 * not equal the sum of its parts, and the server keeps whichever figure is
 * sent. Overwriting a typed total on every keystroke would make an invoice
 * that genuinely disagrees impossible to enter.
 */
export default function NewSupplierInvoicePage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [order, setOrder] = useState<PurchaseOrderListItem | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [freight, setFreight] = useState("");
  const [customs, setCustoms] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [totalOverride, setTotalOverride] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /** The total implied by the components, shown until the operator overrides it. */
  const derivedTotal = useMemo(() => {
    let total = "0";
    for (const part of [subtotal, taxAmount, freight, customs, otherCharges]) {
      if (part) total = money.add(total, part);
    }
    return total;
  }, [subtotal, taxAmount, freight, customs, otherCharges]);

  const effectiveTotal = totalOverride || derivedTotal;
  const canSubmit =
    supplier && invoiceNumber.trim() && Number(effectiveTotal) > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const invoice = await api.post<SupplierInvoice>(
        "/purchasing/supplier-invoices/",
        {
          supplier: supplier.id,
          invoice_number: invoiceNumber.trim(),
          purchase_order: order?.id ?? undefined,
          invoice_date: invoiceDate || undefined,
          due_date: dueDate || undefined,
          subtotal: subtotal || undefined,
          tax_amount: taxAmount || undefined,
          freight_cost: freight || undefined,
          customs_duty: customs || undefined,
          other_charges: otherCharges || undefined,
          // Sent only when the operator typed one, so the server derives it
          // otherwise and there is a single rule for which figure wins.
          total_amount: totalOverride || undefined,
          notes,
        },
      );
      toast.success(t.toasts.created, invoice.invoice_number);
      router.push(`/purchasing/supplier-invoices/${invoice.id}`);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">
          {t.payables.newSupplierInvoice}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t.payables.supplierInvoicesSubtitle}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateErrorDetailed(error, t)}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.payables.supplierInvoice}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t.purchasing.supplier} required>
            <EntityPicker<Supplier>
              path="/partners/suppliers/"
              value={supplier}
              onChange={(value) => {
                setSupplier(value);
                // The order belongs to the previous supplier; keeping it would
                // send a mismatched pair the server then refuses.
                setOrder(null);
              }}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getSublabel={(item) => item.supplier_code}
            />
          </Field>

          <Field label={t.payables.invoiceNumber} required>
            <Input
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="FT-2026-0142"
            />
          </Field>

          <Field
            label={t.payables.relatedOrder}
            hint={t.payables.noRelatedOrder}
          >
            <EntityPicker<PurchaseOrderListItem>
              path="/purchasing/orders/"
              value={order}
              onChange={setOrder}
              getKey={(item) => item.id}
              getLabel={(item) => item.order_number}
              getSublabel={(item) => item.supplier_name}
              disabled={!supplier}
              params={supplier ? { supplier: supplier.id } : undefined}
            />
          </Field>

          <Field label={t.payables.invoiceDate}>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </Field>

          <Field label={t.payables.dueDate} hint={t.payables.dueDateHint}>
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.payables.totalAmount}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t.common.subtotal}>
            <Input
              type="number"
              min="0"
              step="any"
              value={subtotal}
              onChange={(event) => setSubtotal(event.target.value)}
            />
          </Field>
          <Field label={t.sales.tax}>
            <Input
              type="number"
              min="0"
              step="any"
              value={taxAmount}
              onChange={(event) => setTaxAmount(event.target.value)}
            />
          </Field>
          <Field label={t.purchasing.freightCost}>
            <Input
              type="number"
              min="0"
              step="any"
              value={freight}
              onChange={(event) => setFreight(event.target.value)}
            />
          </Field>
          <Field label={t.purchasing.customsDuty}>
            <Input
              type="number"
              min="0"
              step="any"
              value={customs}
              onChange={(event) => setCustoms(event.target.value)}
            />
          </Field>
          <Field label={t.purchasing.otherCharges}>
            <Input
              type="number"
              min="0"
              step="any"
              value={otherCharges}
              onChange={(event) => setOtherCharges(event.target.value)}
            />
          </Field>
          <Field label={t.payables.totalAmount} hint={t.payables.totalHint}>
            <Input
              type="number"
              min="0"
              step="any"
              value={totalOverride}
              placeholder={derivedTotal}
              onChange={(event) => setTotalOverride(event.target.value)}
            />
          </Field>

          <div className="sm:col-span-2 flex justify-between border-t border-border pt-3 text-base font-semibold">
            <span>{t.common.total}</span>
            <span>{fmt.money(effectiveTotal)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.common.notes}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          {t.common.cancel}
        </Button>
        <Button onClick={submit} loading={submitting} disabled={!canSubmit}>
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}
