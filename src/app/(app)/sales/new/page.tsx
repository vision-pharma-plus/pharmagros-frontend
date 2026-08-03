"use client";

import { AlertTriangle, Plus, Printer, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ApiError, api, printBlob } from "@/lib/api/client";
import type {
  CustomerListItem,
  MedicineListItem,
  Sale,
  Warehouse,
} from "@/lib/api/types";
import { computeLine, money, priceExclVat } from "@/lib/format";
import { translateError, translateErrorDetailed, useQuery } from "@/lib/hooks";
import { useFormat, useLocale, useTranslation } from "@/lib/i18n/provider";
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
  const fmt = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const can = useAuth((state) => state.can);

  const [customer, setCustomer] = useState<CustomerListItem | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  /**
   * `?type=CREDIT` preselects a credit sale — how "New invoice" arrives here,
   * since a credit sale is what raises an invoice.
   *
   * Still gated on the permission: the CREDIT option is hidden from anyone
   * without it, and a URL must not select what the form would not offer. A
   * lazy initialiser rather than an effect, so the first render is already
   * correct and the operator never sees the type flip under them.
   */
  const [saleType, setSaleType] = useState<"CASH" | "CREDIT">(() =>
    searchParams.get("type") === "CREDIT" && can("sales.sell_on_credit")
      ? "CREDIT"
      : "CASH",
  );
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
  const [overridePrint, setOverridePrint] = useState(false);
  // Which of the two buttons is in flight, so only that one shows a spinner,
  // and so the override dialog resumes the action the operator first chose.
  const [pendingAction, setPendingAction] = useState<"confirm" | "print" | null>(
    null,
  );

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
   * The customer cannot transact on credit at all — blocked, cash-only,
   * inactive, or carrying no limit.
   *
   * Checked separately from headroom because the two are independent: a
   * blocked account keeps whatever unused limit it had, so comparing the
   * total against `available_credit` alone would show a comfortable balance
   * and no warning, right up until the server refused the sale.
   */
  const creditIneligible =
    saleType === "CREDIT" && customer !== null && !customer.is_credit_eligible;

  /**
   * Which of the four ineligibility causes applies, and how to clear it.
   *
   * Mirrors the precedence in `Customer.can_buy_on_credit` so the screen names
   * the same refusal the server would return. Showing one generic message
   * instead left the operator with a remedy that did not fit their case — a
   * cash-only customer being told to lift a block that was never set.
   *
   * `credit_block_reason` is appended when present: the cause is "credit is
   * blocked", the free-text reason is why it was blocked, and both matter.
   */
  const creditIneligibleDetail = (() => {
    if (!creditIneligible || customer === null) return null;
    if (customer.status !== "ACTIVE") return t.sales.creditIneligibleInactive;
    if (customer.credit_blocked) {
      const { reason, fix } = t.sales.creditIneligibleBlocked;
      return {
        reason: customer.credit_block_reason
          ? `${reason} ${customer.credit_block_reason}`
          : reason,
        fix,
      };
    }
    if (customer.payment_terms === "CASH") return t.sales.creditIneligibleCashOnly;
    if (money.compare(customer.credit_limit, "0") <= 0)
      return t.sales.creditIneligibleNoLimit;
    // `is_credit_eligible` is false for a reason this screen does not model
    // yet; the blocked wording is the safest generic fallback.
    return t.sales.creditIneligibleBlocked;
  })();

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
    // A refusal no supervisor can override is better caught here than after
    // the operator has priced up the whole basket and pressed confirm.
    creditIneligibleDetail?.fix,
    shortTender &&
      t.blockers.tenderBelowTotal(
        fmt.money(amountTendered),
        fmt.money(totals.total),
      ),
  ].filter((entry): entry is string => typeof entry === "string");

  const canSubmit = blockers.length === 0;

  /**
   * Warn before the server refuses, so the operator can act on it early.
   *
   * Only meaningful when credit is available in principle; otherwise the
   * ineligibility notice above is the accurate thing to show.
   */
  const creditWarning =
    saleType === "CREDIT" &&
    customer &&
    customer.is_credit_eligible &&
    money.compare(totals.total, customer.available_credit) > 0;

  /**
   * Everything that depends on which document closes this sale, in one place.
   *
   * The sale type decides the closing document, and with it which permission
   * governs printing and how a refusal should read. Deriving both from one
   * descriptor keeps them from drifting apart the way separate
   * `saleType === "CASH"` ternaries eventually do — the receipt-only print
   * gate that hid the button from invoice-printing users was exactly that
   * kind of drift.
   *
   * The PDF route deliberately is not here: it is read off the confirm
   * response instead, since the server is the authority on which document it
   * actually issued.
   */
  const closingDocument =
    saleType === "CASH"
      ? {
          permission: "sales.print_receipt",
          deniedReason: t.permissions.printReceiptNotAllowed,
        }
      : {
          permission: "invoicing.print_invoice",
          deniedReason: t.permissions.printInvoiceNotAllowed,
        };

  /**
   * Print is offered to everyone and disabled when it cannot be used, rather
   * than hidden.
   *
   * A button that disappears is indistinguishable from one that is broken:
   * the operator cannot tell a missing permission from a missing feature, and
   * has nothing to hover to find out. The same reasoning already governs the
   * discount field and the blockers list on this screen.
   */
  const printDenied = !can(closingDocument.permission);

  const submit = async (
    creditOverrideReason?: string,
    options: { print?: boolean } = {},
  ) => {
    if (!customer || !canSubmit) return;
    const print = options.print ?? false;
    setPendingAction(print ? "print" : "confirm");
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

      // Which document to print is read off the response, not assumed from
      // the sale type: the server picks the closing document, so a sale that
      // came back with a receipt prints the receipt whatever was requested.
      // The descriptors carry the route and wording for each.
      const printable = confirmed.receipt_id
        ? {
            path: `/sales/receipts/${confirmed.receipt_id}/pdf/`,
            heading: t.toasts.receiptSentToPrinter,
            number: confirmed.receipt_number,
          }
        : confirmed.invoice_id
          ? {
              path: `/invoicing/invoices/${confirmed.invoice_id}/pdf/`,
              heading: t.toasts.invoiceSentToPrinter,
              number: confirmed.invoice_number,
            }
          : null;

      // The sale is committed by this point. A printer fault must therefore
      // never read as a failed sale, so the print is reported on its own and
      // the operator still lands on the document, where they can retry it.
      if (print && printable) {
        try {
          const blob = await api.download(printable.path, { language: locale });
          printBlob(blob);
          toast.success(printable.heading, printable.number ?? undefined);
        } catch (caught) {
          toast.error(
            t.toasts.printFailed,
            caught instanceof ApiError ? translateError(caught, t) : undefined,
          );
        }
      }

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

      // Only a genuine limit breach is recoverable by an authorised
      // supervisor, so only that opens the override dialog. A blocked,
      // cash-only or inactive account is refused outright — offering an
      // override there sends the operator to fetch a supervisor who cannot
      // help, and the server would refuse the override anyway.
      if (
        apiError.code === "credit_limit_exceeded" &&
        can("sales.override_credit_limit") &&
        !creditOverrideReason
      ) {
        // Remember whether the operator asked to print, so authorising the
        // override resumes that same action rather than silently downgrading
        // it to a plain confirm.
        setOverridePrint(print);
        setOverrideOpen(true);
      }
      setError(apiError);
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  };

  // Detailed: a credit refusal carries the specific reason (which block, whose
  // account, what the balance is) and the generic per-code sentence would
  // discard exactly the part the operator needs to act on.
  const errorMessage = translateErrorDetailed(error, t);

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
                            `${item.product_code} · ${fmt.money(item.selling_price)}`
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
                          {computed ? fmt.money(computed.total) : "—"}
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
                <span className="tabular-nums">{fmt.money(totals.gross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.discount}</span>
                <span className="tabular-nums">
                  {money.isZero(totals.discount)
                    ? fmt.money("0")
                    : `− ${fmt.money(totals.discount)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.tax}</span>
                <span className="tabular-nums">{fmt.money(totals.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <span>{t.common.total}</span>
                <span className="tabular-nums">{fmt.money(totals.total)}</span>
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
                  <span className="tabular-nums">{fmt.money(changeDue)}</span>
                </div>
              )}

              {/* The figure is shown only when it can actually be spent. A
                  blocked or cash-only account keeps its unused limit, so
                  printing it here advertised credit the server would refuse
                  — the contradiction that made a 7 080 BIF sale look like it
                  had breached a 1 000 000 BIF limit. */}
              {customer && saleType === "CREDIT" && customer.is_credit_eligible && (
                <div className="space-y-1 rounded-md bg-muted p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t.partners.availableCredit}
                    </span>
                    <span className="tabular-nums">
                      {fmt.money(customer.available_credit)}
                    </span>
                  </div>
                </div>
              )}

              {creditIneligibleDetail && (
                <Alert variant="destructive">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-medium">
                        {t.sales.creditNotAvailable}
                      </span>
                      {/* The cause, always — a headline with no reason is what
                          sent operators to the customer record to guess. */}
                      <span className="block">
                        {creditIneligibleDetail.reason}
                      </span>
                    </span>
                  </span>
                </Alert>
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

              <div className="space-y-2">
                {/* Confirm-and-print leads: at a counter the document is the
                    point of the transaction, and the operator would otherwise
                    confirm here, wait for the next page to load, and hunt for
                    a second button before handing anything over.

                    Disabled rather than hidden when the permission is absent,
                    with the reason on hover — the operator can then see the
                    action exists and ask for the right permission, instead of
                    reporting a missing button. */}
                <Button
                  className="w-full"
                  disabled={!canSubmit || submitting || printDenied}
                  loading={submitting && pendingAction === "print"}
                  title={printDenied ? closingDocument.deniedReason : undefined}
                  onClick={() => void submit(undefined, { print: true })}
                >
                  <Printer className="h-4 w-4" />
                  {t.sales.confirmAndPrint}
                </Button>
                <Button
                  className="w-full"
                  // Demoted to the secondary style only while print is usable,
                  // so there is exactly one primary action either way.
                  variant={printDenied ? "default" : "outline"}
                  disabled={!canSubmit || submitting}
                  loading={submitting && pendingAction === "confirm"}
                  onClick={() => void submit()}
                >
                  {t.sales.confirmSale}
                </Button>
              </div>

              {/* Said once, in text, for anyone who will not hover a disabled
                  control — a touch counter has no hover at all. */}
              {printDenied && (
                <p className="text-xs text-muted-foreground">
                  {closingDocument.deniedReason}
                </p>
              )}
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
              onClick={() =>
                void submit(overrideReason, { print: overridePrint })
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
