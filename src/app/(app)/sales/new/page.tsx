"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
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
import { computeLine, formatMoney, money } from "@/lib/format";
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
      const computed = computeLine(
        line.quantity,
        line.unitPrice || "0",
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
          generate_invoice: true,
          ...(creditOverrideReason
            ? { credit_override_reason: creditOverrideReason }
            : {}),
        },
      );

      setOverrideOpen(false);
      toast.success(
        t.toasts.saleConfirmed,
        confirmed.invoice_number
          ? `${confirmed.invoice_number} · ${t.toasts.saleConfirmedDetail}`
          : undefined,
      );
      // Land on the invoice itself rather than a filtered list: the operator's
      // next act is to print or collect payment on this specific document.
      router.push(
        confirmed.invoice_id
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

              <Field label={t.sales.saleType} required>
                <Select
                  value={saleType}
                  onChange={(event) =>
                    setSaleType(event.target.value as "CASH" | "CREDIT")
                  }
                >
                  <option value="CASH">{t.sales.cashSale}</option>
                  {/* Credit sales require a distinct permission. */}
                  {can("sales.sell_on_credit") && (
                    <option value="CREDIT">{t.sales.creditSale}</option>
                  )}
                </Select>
              </Field>

              <Field label={t.inventory.warehouse} required>
                <Select
                  value={resolvedWarehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  {warehouseList.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} {warehouse.name}
                    </option>
                  ))}
                </Select>
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
                const computed =
                  line.product && line.quantity
                    ? computeLine(
                        line.quantity,
                        line.unitPrice || "0",
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
                      <Field label={t.sales.unitPrice}>
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
              {t.sales.overrideReason} — {t.nav.auditLog}
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
