"use client";

/**
 * Raising an invoice by hand.
 *
 * Every other invoice in the system is a by-product of a sale: the counter
 * screen dispenses stock and the invoice falls out of it. That leaves no way to
 * bill anything the pharmacy did not hand over goods for — a hospital's monthly
 * service charge, a delivery fee, a correction agreed after the fact — and the
 * create endpoint existed with no screen pointing at it.
 *
 * This screen is deliberately *not* a second point of sale. It writes no stock
 * movement and allocates no batches, which is why lines are free text with an
 * optional catalogue product attached rather than a product picker that implies
 * dispensing. That difference is stated on the page rather than left for
 * someone to discover from a stock report that never moved.
 *
 * Prices are entered VAT-inclusive, matching the catalogue and the counter, and
 * converted to the net figure the API stores. The invoice is created as a
 * DRAFT: posting it is a separate, deliberate act on the detail page, because
 * posting is what makes it a fiscal document.
 */

import { Plus, Trash2 } from "lucide-react";
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
import type {
  CustomerListItem,
  Invoice,
  MedicineListItem,
} from "@/lib/api/types";
import { computeLine, formatMoney, money, priceExclVat } from "@/lib/format";
import { translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface DraftLine {
  /** Local key; the server assigns real identifiers. */
  key: string;
  /**
   * Optional. A line may name a catalogue product — which fills in the price,
   * VAT rate and description — or stand alone as free text for a service.
   */
  product: MedicineListItem | null;
  description: string;
  quantity: string;
  /** VAT-inclusive, as on the catalogue and at the counter. */
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
}

const emptyLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  product: null,
  description: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "0",
  taxRate: "0",
});

export default function NewInvoicePage() {
  const t = useTranslation();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [isCreditSale, setIsCreditSale] = useState(true);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  /**
   * Attach a catalogue product to a line.
   *
   * The description and price are only filled when the user has not typed
   * their own — picking a product should not silently discard wording or a
   * negotiated price that was already entered.
   */
  const selectProduct = (line: DraftLine, product: MedicineListItem | null) => {
    updateLine(line.key, {
      product,
      description: line.description || product?.display_name || "",
      unitPrice: line.unitPrice || product?.selling_price || "",
      // The product's own rate, not a flat 18 %: a VAT-exempt medicine would
      // otherwise preview a total the server then contradicts.
      taxRate: product?.effective_vat_rate ?? line.taxRate,
    });
  };

  /**
   * Live totals, mirroring the server's discount-then-tax ordering.
   *
   * `unitPrice` is VAT-inclusive on screen but net in the payload, so it goes
   * through `priceExclVat` here exactly as it does on submit — the preview and
   * what is sent must come from the same figure.
   */
  const totals = useMemo(() => {
    let gross = "0";
    let discount = "0";
    let tax = "0";
    let total = "0";

    for (const line of lines) {
      if (!line.quantity || !line.unitPrice) continue;
      const computed = computeLine(
        line.quantity,
        priceExclVat(line.unitPrice, line.taxRate || "0"),
        line.discountPercent || "0",
        line.taxRate || "0",
      );
      gross = money.add(gross, computed.gross);
      discount = money.add(discount, computed.discount);
      tax = money.add(tax, computed.tax);
      total = money.add(total, computed.total);
    }

    return { gross, discount, tax, total };
  }, [lines]);

  /**
   * Lines the user has actually started.
   *
   * A blank trailing row is how someone abandons a line they added by mistake;
   * counting it as incomplete would make the form complain about a line that
   * is not really there.
   */
  const startedLines = lines.filter(
    (line) =>
      line.product !== null ||
      line.description.trim() !== "" ||
      line.unitPrice !== "",
  );

  const readyLines = startedLines.filter(
    (line) =>
      line.description.trim() !== "" &&
      Number(line.quantity) > 0 &&
      line.unitPrice !== "" &&
      Number(line.unitPrice) >= 0,
  );

  // Stated before submitting rather than after a 400: posting is refused
  // server-side for a credit invoice with no NIF, and the fix is on the
  // customer record, not on this form.
  const missingNifForCredit =
    isCreditSale && customer !== null && !customer.nif;

  const blockers = [
    !customer && t.blockers.selectCustomer,
    startedLines.length === 0 && t.blockers.addOneLine,
    startedLines.some((line) => line.description.trim() === "") &&
      t.blockers.descriptionMissing,
    startedLines.some((line) => !(Number(line.quantity) > 0)) &&
      t.blockers.quantityMissing,
    startedLines.some((line) => line.unitPrice === "") &&
      t.blockers.unitPriceMissing,
  ].filter((entry): entry is string => typeof entry === "string");

  const canSubmit = readyLines.length > 0 && blockers.length === 0;

  const submit = async () => {
    if (!customer) return;
    setSubmitting(true);
    setError(null);
    try {
      const invoice = await api.post<Invoice>("/invoicing/invoices/", {
        customer: customer.id,
        is_credit_sale: isCreditSale,
        reference,
        notes,
        lines: readyLines.map((line) => ({
          product: line.product?.id ?? null,
          description: line.description.trim(),
          quantity: line.quantity,
          // Net of VAT — the API stores line amounts excluding tax and adds
          // it back from `tax_rate`.
          unit_price: priceExclVat(line.unitPrice, line.taxRate || "0"),
          discount_percent: line.discountPercent || "0",
          tax_rate: line.taxRate || "0",
        })),
      });
      toast.success(t.invoicing.invoiceCreated, invoice.invoice_number);
      router.push(`/invoicing/invoices/${invoice.id}`);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {t.invoicing.newInvoiceTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.invoicing.newInvoiceSubtitle}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          {t.common.cancel}
        </Button>
      </div>

      {errorMessage && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {errorMessage}
        </Alert>
      )}

      {/* Says up front that nothing leaves the shelf, so nobody bills a
          dispensing here and waits for a stock movement that never comes. */}
      <Alert variant="warning">{t.invoicing.noStockMovement}</Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t.invoicing.invoiceDetails}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label={t.sales.customer} required>
            <EntityPicker<CustomerListItem>
              path="/partners/customers/"
              value={customer}
              onChange={setCustomer}
              getKey={(item) => item.id}
              getLabel={(item) => item.business_name}
              getSublabel={(item) => item.customer_code}
              createResource={
                can("partners.add_customer") ? "customer" : undefined
              }
            />
          </Field>

          {missingNifForCredit && (
            <Alert variant="warning">
              {t.invoicing.nifRequiredForCredit}
            </Alert>
          )}

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={isCreditSale}
              onChange={(event) => setIsCreditSale(event.target.checked)}
            />
            <span>
              <span className="font-medium">
                {t.invoicing.creditSaleLabel}
              </span>
              <span className="block text-muted-foreground">
                {t.invoicing.creditSaleLabelHint}
              </span>
            </span>
          </label>

          <Field label={t.invoicing.reference} hint={t.invoicing.referenceHint}>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.invoicing.invoiceLines}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => {
            const computed =
              line.quantity && line.unitPrice
                ? computeLine(
                    line.quantity,
                    priceExclVat(line.unitPrice, line.taxRate || "0"),
                    line.discountPercent || "0",
                    line.taxRate || "0",
                  )
                : null;

            return (
              <div
                key={line.key}
                className="space-y-3 rounded-md border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">
                    {t.inventory.lineNumber} {index + 1}
                  </p>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.sales.removeLine}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((l) => l.key !== line.key),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Optional on purpose — this screen bills services as often
                    as products, and a required picker would force a bogus
                    catalogue entry for a delivery charge. */}
                <Field label={t.nav.medicines} hint={t.invoicing.freeTextLine}>
                  <EntityPicker<MedicineListItem>
                    path="/catalog/medicines/"
                    value={line.product}
                    onChange={(product) => selectProduct(line, product)}
                    getKey={(item) => item.id}
                    getLabel={(item) => item.display_name}
                    getSublabel={(item) => item.product_code}
                  />
                </Field>

                <Field
                  label={t.invoicing.lineDescription}
                  required
                  hint={t.invoicing.lineDescriptionHint}
                >
                  <Input
                    value={line.description}
                    onChange={(event) =>
                      updateLine(line.key, { description: event.target.value })
                    }
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label={t.common.quantity} required>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, { quantity: event.target.value })
                      }
                    />
                  </Field>

                  <Field label={t.sales.unitPriceInclVat} required>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(line.key, { unitPrice: event.target.value })
                      }
                    />
                  </Field>

                  <Field label={`${t.sales.discount} %`}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={line.discountPercent}
                      onChange={(event) =>
                        updateLine(line.key, {
                          discountPercent: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label={`${t.sales.tax} %`}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.taxRate}
                      onChange={(event) =>
                        updateLine(line.key, { taxRate: event.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className="flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    {t.sales.lineTotal}
                  </span>
                  <span className="font-medium tabular-nums">
                    {computed ? formatMoney(computed.total) : "—"}
                  </span>
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            <Plus className="h-4 w-4" />
            {t.sales.addLine}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.common.notes}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.common.subtotal}</span>
            <span className="tabular-nums">{formatMoney(totals.gross)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.sales.discount}</span>
            <span className="tabular-nums">
              {money.isZero(totals.discount)
                ? formatMoney("0")
                : `− ${formatMoney(totals.discount)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.sales.tax}</span>
            <span className="tabular-nums">{formatMoney(totals.tax)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>{t.common.total}</span>
            <span className="tabular-nums">{formatMoney(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      {blockers.length > 0 && startedLines.length > 0 && (
        <Alert variant="warning" title={t.blockers.heading}>
          <ul className="list-inside list-disc space-y-1">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">
          {t.invoicing.invoiceCreatedHint}
        </p>
        <Button onClick={submit} disabled={!canSubmit} loading={submitting}>
          {t.common.create}
        </Button>
      </div>
    </div>
  );
}
