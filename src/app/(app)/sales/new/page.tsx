"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EntityPicker } from "@/components/entity-picker";
import { ReferenceSelect } from "@/components/reference-select";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type {
  CustomerListItem,
  MedicineListItem,
  Sale,
  Warehouse,
} from "@/lib/api/types";
import { computeLine, formatMoney, money, priceExclVat } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface DraftLine {
  /** Local key; the server assigns real identifiers. */
  key: string;
  product: MedicineListItem | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  /** Copied from the product when selected, so VAT-exempt lines stay exempt. */
  taxRate: string;
}

const emptyLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  product: null,
  quantity: "",
  unitPrice: "",
  discountPercent: "0",
  taxRate: "0",
});

export default function NewSalePage() {
  const t = useTranslation();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [saleType, setSaleType] = useState<"CASH" | "CREDIT">("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  // Cash tender. Only sent for a cash sale — a credit sale is settled later,
  // through a payment against its invoice.
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [amountTendered, setAmountTendered] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const warehouses = useQuery<{ results: Warehouse[] }>("/inventory/warehouses/");
  const warehouseList = warehouses.data?.results ?? [];

  // Default to the flagged default warehouse rather than making the operator
  // choose on every single-site sale.
  const resolvedWarehouseId =
    warehouseId || warehouseList.find((w) => w.is_default)?.id || warehouseList[0]?.id || "";

  /**
   * Live totals.
   *
   * Computed with decimal.js using the same discount-then-tax ordering as the
   * backend, so the figure shown while typing matches what the server will
   * store. The server remains authoritative — this is a preview.
   */
  const totals = useMemo(() => {
    let gross = "0";
    let discount = "0";
    let tax = "0";
    let total = "0";

    for (const line of lines) {
      if (!line.product || !line.quantity) continue;
      // `unitPrice` is the VAT-inclusive counter price, both when prefilled
      // from the catalogue and when the operator overrides it. computeLine
      // works on the net base and adds VAT itself, so the price is extracted
      // first — passing the inclusive figure straight in would tax it twice
      // and show a preview total the server would then contradict.
      const computed = computeLine(
        line.quantity,
        priceExclVat(line.unitPrice || "0", line.taxRate || "0"),
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

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const selectProduct = (key: string, product: MedicineListItem | null) => {
    updateLine(key, {
      product,
      // Prefill the catalogue price; the operator may override it if they hold
      // the discount permission.
      unitPrice: product?.selling_price ?? "",
      // The product's own rate, not a flat assumption: hardcoding 18 % made
      // the preview total wrong for every VAT-exempt line, so the figure on
      // screen disagreed with the invoice the server then produced.
      taxRate: product?.effective_vat_rate ?? "0",
    });
  };

  const canDiscount = can("sales.apply_discount");

  const validLines = lines.filter(
    (line) => line.product && line.quantity && Number(line.quantity) > 0,
  );

  /**
   * Change due on a cash tender.
   *
   * Null when nothing was entered — the tender then defaults to the exact
   * total server-side, which is the common case at a counter that does not
   * count a drawer. Negative means the customer has not handed over enough,
   * which the server refuses, so it is caught here first.
   */
  const changeDue =
    saleType === "CASH" && paymentMethod === "CASH" && amountTendered
      ? money.subtract(amountTendered, totals.total)
      : null;

  const shortTender = changeDue !== null && money.compare(changeDue, "0") < 0;

  /**
   * Why the submit button is disabled, in the user's words.
   *
   * A dead button with no explanation is the most common way an operator gets
   * stuck on this screen — they cannot tell a missing customer from a missing
   * quantity, and nothing on the page distinguishes the two.
   */
  const blockers = [
    customer === null && t.blockers.selectCustomer,
    resolvedWarehouseId === "" && t.blockers.selectWarehouse,
    validLines.length === 0 && t.blockers.addOneLine,
    shortTender && t.blockers.tenderBelowTotal,
  ].filter((entry): entry is string => typeof entry === "string");

  const canSubmit = blockers.length === 0;

  /** Warn before the server refuses, so the operator can act on it early. */
  const creditWarning =
    saleType === "CREDIT" &&
    customer &&
    money.compare(totals.total, customer.available_credit) > 0;

  const submit = async (creditOverrideReason?: string) => {
    if (!customer || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const sale = await api.post<Sale>("/sales/sales/", {
        customer: customer.id,
        warehouse: resolvedWarehouseId,
        sale_type: saleType,
        customer_order_reference: reference,
        notes,
        lines: validLines.map((line) => ({
          product: line.product!.id,
          quantity: line.quantity,
          unit_price: line.unitPrice || undefined,
          discount_percent: line.discountPercent || undefined,
        })),
      });

      const confirmed = await api.post<Sale>(
        `/sales/sales/${sale.id}/confirm/`,
        {
          // Omitted deliberately: the server picks the closing document from
          // the sale type — a receipt for a cash sale, an invoice for a credit
          // one. Forcing `true` here is what used to invoice every counter
          // sale and land the operator on an invoice they never asked for.
          ...(saleType === "CASH"
            ? {
                payment_method: paymentMethod,
                ...(paymentReference ? { payment_reference: paymentReference } : {}),
                ...(amountTendered ? { amount_tendered: amountTendered } : {}),
              }
            : {}),
          ...(creditOverrideReason
            ? { credit_override_reason: creditOverrideReason }
            : {}),
        },
      );

      setOverrideOpen(false);
      toast.success(
        t.toasts.saleConfirmed,
        confirmed.receipt_number ?? confirmed.invoice_number ?? undefined,
      );
      // Land on the document the customer is actually waiting for: the receipt
      // for a cash sale, the invoice for a credit one.
      router.push(
        confirmed.receipt_id
          ? `/sales/receipts/${confirmed.receipt_id}`
          : confirmed.invoice_id
            ? `/invoicing/invoices/${confirmed.invoice_id}`
            : "/sales",
      );
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) });

      // A credit refusal is recoverable by an authorised supervisor, so it
      // opens the override dialog rather than just reporting failure.
      if (
        apiError.code === "credit_limit_exceeded" &&
        can("sales.override_credit_limit") &&
        !creditOverrideReason
      ) {
        setOverrideOpen(true);
      }
      setError(apiError);
    } finally {
      setSubmitting(false);
    }
  };

  const errorMessage = translateError(error, t);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.newSale}</h1>
          <p className="text-sm text-muted-foreground">{t.nav.sales}</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/sales")}>
          {t.common.cancel}
        </Button>
      </div>

      {errorMessage && !overrideOpen && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {errorMessage}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.sales.customer}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label={t.sales.customer} required className="sm:col-span-2">
                <EntityPicker<CustomerListItem>
                  path="/partners/customers/"
                  value={customer}
                  onChange={setCustomer}
                  getKey={(item) => item.id}
                  getLabel={(item) => item.business_name}
                  getSublabel={(item) =>
                    `${item.customer_code}${item.nif ? ` · NIF ${item.nif}` : ""}`
                  }
                  placeholder={t.sales.customer}
                  // A walk-in that is not yet on file used to mean abandoning
                  // the basket to go and register them.
                  createResource="customer"
                />
              </Field>

              {/* The transaction type decides which document closes the sale,
                  so it says so plainly rather than leaving the operator to
                  discover it at checkout. */}
              <Field
                label={t.sales.saleType}
                required
                hint={
                  saleType === "CASH"
                    ? t.sales.cashSaleHint
                    : t.sales.creditSaleHint
                }
              >
                <Select
                  value={saleType}
                  onChange={(event) =>
                    setSaleType(event.target.value as "CASH" | "CREDIT")
                  }
                >
                  <option value="CASH">{t.sales.cashSaleOption}</option>
                  {/* Credit sales require a distinct permission. */}
                  {can("sales.sell_on_credit") && (
                    <option value="CREDIT">{t.sales.creditSaleOption}</option>
                  )}
                </Select>
              </Field>

              <Field label={t.inventory.warehouse} required>
                {/* ReferenceSelect rather than a plain Select so a warehouse
                    that is not yet on file can be added here, the way the
                    customer field already allows. This was the last warehouse
                    picker in the app still without that affordance. */}
                <ReferenceSelect
                  resource="warehouse"
                  value={resolvedWarehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{t.sections.lineItems}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                <Plus className="h-4 w-4" />
                {t.sales.addLine}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.map((line, index) => {
                // Same extraction as the totals above: the entered price is
                // VAT-inclusive, computeLine expects the net base.
                const computed =
                  line.product && line.quantity
                    ? computeLine(
                        line.quantity,
                        priceExclVat(line.unitPrice || "0", line.taxRate || "0"),
                        line.discountPercent || "0",
                        line.taxRate || "0",
                      )
                    : null;

                return (
                  <div
                    key={line.key}
                    // Two columns at the smallest size: full-width stacking
                    // made a single line item about a screen tall on the
                    // tablets used at the counter.
                    className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 sm:grid-cols-12"
                  >
                    <div className="col-span-2 sm:col-span-12">
                      <Field label={`${index + 1}. ${t.catalog.name}`}>
                        <EntityPicker<MedicineListItem>
                          path="/catalog/medicines/"
                          value={line.product}
                          onChange={(product) => selectProduct(line.key, product)}
                          getKey={(item) => item.id}
                          getLabel={(item) => item.display_name}
                          getSublabel={(item) =>
                            `${item.product_code} · ${formatMoney(item.selling_price)}`
                          }
                          params={{ status: "ACTIVE" }}
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-3">
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
                    </div>

                    <div className="sm:col-span-3">
                      <Field label={t.sales.unitPriceInclVat}>
                        <Input
                          type="number"
                          min="0"
                          step="0.0001"
                          inputMode="decimal"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateLine(line.key, { unitPrice: event.target.value })
                          }
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-2">
                      <Field
                        label={`${t.sales.discount} %`}
                        // A greyed-out field with no explanation reads as
                        // broken; say plainly that it is a permission.
                        hint={
                          canDiscount
                            ? undefined
                            : t.permissions.discountNotAllowed
                        }
                      >
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          inputMode="decimal"
                          value={line.discountPercent}
                          // Applying a discount is a privileged action.
                          disabled={!canDiscount}
                          title={
                            canDiscount
                              ? undefined
                              : t.permissions.discountNotAllowed
                          }
                          onChange={(event) =>
                            updateLine(line.key, {
                              discountPercent: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>

                    <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-4">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.sales.lineTotal}
                        </p>
                        <p className="truncate font-semibold tabular-nums">
                          {computed ? formatMoney(computed.total) : "—"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((item) => item.key !== line.key),
                          )
                        }
                        aria-label={t.sales.removeLine}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Tender details, for a cash sale only. A credit sale is settled
              later against its invoice, so asking how it was paid here would
              be asking about money that has not arrived. */}
          {saleType === "CASH" && (
            <Card>
              <CardHeader>
                <CardTitle>{t.sales.payment}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label={t.sales.paymentMethod} required>
                  <Select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option value="CASH">{t.paymentMethods.CASH}</option>
                    <option value="MOBILE_MONEY">
                      {t.paymentMethods.MOBILE_MONEY}
                    </option>
                    <option value="CARD">{t.paymentMethods.CARD}</option>
                    <option value="BANK_TRANSFER">
                      {t.paymentMethods.BANK_TRANSFER}
                    </option>
                    <option value="CHEQUE">{t.paymentMethods.CHEQUE}</option>
                    <option value="OTHER">{t.paymentMethods.OTHER}</option>
                  </Select>
                </Field>

                {/* Cash is the only tender where change is counted back, so
                    the field is offered only then. Every other method is
                    charged for the exact amount. */}
                {paymentMethod === "CASH" ? (
                  <Field label={t.sales.amountTendered} hint={t.sales.tenderHint}>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={amountTendered}
                      onChange={(event) => setAmountTendered(event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field label={t.sales.paymentReference}>
                    <Input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      placeholder={t.sales.paymentReferencePlaceholder}
                    />
                  </Field>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <Field label={t.common.notes}>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Capped to the viewport and scrollable inside: with a licence
              warning and a credit warning stacked above the totals, the card
              could otherwise grow past the fold and strand its own submit
              button on a short screen. */}
          <Card className="lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100vh-6rem)] lg:flex-col">
            <CardHeader>
              <CardTitle>{t.sales.grandTotal}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <span>{t.common.total}</span>
                <span className="tabular-nums">{formatMoney(totals.total)}</span>
              </div>

              {/* States which document the sale will produce, before the
                  operator commits — the question this screen was previously
                  silent about. */}
              <div className="rounded-md bg-muted p-3 text-xs">
                <p className="font-medium">
                  {saleType === "CASH"
                    ? t.sales.willIssueReceipt
                    : t.sales.willIssueInvoice}
                </p>
              </div>

              {changeDue !== null && !shortTender && (
                <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
                  <span>{t.sales.changeDue}</span>
                  <span className="tabular-nums">{formatMoney(changeDue)}</span>
                </div>
              )}

              {customer && saleType === "CREDIT" && (
                <div className="space-y-1 rounded-md bg-muted p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t.partners.availableCredit}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(customer.available_credit)}
                    </span>
                  </div>
                </div>
              )}

              {customer?.licence_is_expired && (
                <Alert variant="destructive">
                  {t.partners.licenceExpiredWarning}
                </Alert>
              )}

              {creditWarning && (
                <Alert variant="warning">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {t.sales.creditLimitExceeded}
                  </span>
                </Alert>
              )}

              {blockers.length > 0 && (
                <div className="rounded-md bg-muted p-3 text-xs">
                  <p className="font-medium">{t.blockers.heading}</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                className="w-full"
                disabled={!canSubmit}
                loading={submitting}
                onClick={() => void submit()}
              >
                {t.sales.confirmSale}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.sales.creditOverride}</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={t.sales.overrideReason} required>
              <Textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                rows={3}
                autoFocus
              />
            </Field>
            {/* The override is recorded against the authorising user in the
                audit trail, so the dialog states that plainly. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {t.sales.overrideReason} &middot; {t.nav.auditLog}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={overrideReason.trim().length === 0}
              loading={submitting}
              onClick={() => void submit(overrideReason)}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
