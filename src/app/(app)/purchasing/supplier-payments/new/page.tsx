"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EntityPicker } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Progress,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type {
  SupplierInvoiceListItem,
  Supplier,
  SupplierPayment,
} from "@/lib/api/types";
import { formatDate, money } from "@/lib/format";
import { translateErrorDetailed } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

type AllocationMode = "AUTO" | "MANUAL";

/**
 * Record a payment to a supplier.
 *
 * Two ways to say where the money goes, matching what the server accepts:
 *
 *   * AUTO — settle the supplier's open invoices oldest due first. The common
 *     case, and the one that avoids late-payment problems by construction.
 *   * MANUAL — explicit amounts per invoice, for a payment that part-settles
 *     one bill and clears another. No automatic rule can infer that split.
 *
 * Anything not allocated stays on the payment as credit on account. It is
 * shown rather than silently absorbed, because it is real money that left the
 * bank and someone has to match it later.
 */
export default function NewSupplierPaymentPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentReference, setPaymentReference] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [notes, setNotes] = useState("");

  const [mode, setMode] = useState<AllocationMode>("AUTO");
  const [openInvoices, setOpenInvoices] = useState<SupplierInvoiceListItem[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  /** Manual allocations, keyed by invoice id. Only used in MANUAL mode. */
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Arriving from an invoice's "record a payment" button: preselect that
  // supplier and aim the money at the invoice the operator came from.
  const presetSupplier = searchParams.get("supplier");
  const presetInvoice = searchParams.get("invoice");

  useEffect(() => {
    if (!presetSupplier || supplier) return;
    api
      .get<Supplier>(`/partners/suppliers/${presetSupplier}/`)
      .then(setSupplier)
      .catch(() => {
        // A bad id in the URL should not block the form: the operator can
        // still pick the supplier by hand.
      });
  }, [presetSupplier, supplier]);

  /** Load the supplier's open invoices whenever the supplier changes. */
  useEffect(() => {
    if (!supplier) {
      setOpenInvoices([]);
      setAllocations({});
      return;
    }
    setLoadingInvoices(true);
    api
      .get<Paginated<SupplierInvoiceListItem>>(
        "/purchasing/supplier-invoices/",
        { supplier: supplier.id, outstanding: true, page_size: 100 },
      )
      .then((response) => {
        setOpenInvoices(response.results);
        if (presetInvoice) {
          const target = response.results.find(
            (invoice) => invoice.id === presetInvoice,
          );
          if (target) {
            // Arrived from that invoice's "record a payment" button: default
            // the amount to what it owes. Allocation stays automatic — the
            // server settles oldest-due first, and with the amount matching
            // this invoice's balance that is where the money lands anyway.
            setAmount((current) => current || target.balance_due);
          }
        }
      })
      .catch(() => setOpenInvoices([]))
      .finally(() => setLoadingInvoices(false));
  }, [supplier, presetInvoice]);

  /**
   * What the server will do with this money, computed here for display.
   *
   * Deliberately a *mirror* of `_allocate_supplier_payment`: oldest due date
   * first, each invoice taking up to its balance. It decides nothing — the
   * server allocates — but it means the operator sees which invoices are about
   * to be settled before committing, rather than finding out afterwards. The
   * two rules must stay in step; the invoices arrive already ordered by the
   * server's own `_settleable_supplier_invoices`, so this walks them in the
   * order given rather than re-sorting and risking a different answer.
   */
  const autoPlan = useMemo(() => {
    const rows: { invoice: SupplierInvoiceListItem; amount: string }[] = [];
    if (!amount || Number(amount) <= 0) return { rows, leftover: "0" };

    let left = amount;
    for (const invoice of openInvoices) {
      if (money.compare(left, "0") <= 0) break;
      const applied =
        money.compare(left, invoice.balance_due) < 0 ? left : invoice.balance_due;
      if (money.compare(applied, "0") <= 0) continue;
      rows.push({ invoice, amount: applied });
      left = money.subtract(left, applied);
    }
    return { rows, leftover: left };
  }, [amount, openInvoices]);

  const manualTotal = useMemo(() => {
    let total = "0";
    for (const value of Object.values(allocations)) {
      if (value) total = money.add(total, value);
    }
    return total;
  }, [allocations]);

  const allocatedTotal = mode === "AUTO" ? money.subtract(amount || "0", autoPlan.leftover) : manualTotal;
  const remaining = amount ? money.subtract(amount, allocatedTotal) : "0";
  const overAllocated =
    mode === "MANUAL" && amount ? money.compare(remaining, "0") < 0 : false;

  const canSubmit =
    supplier &&
    amount &&
    Number(amount) > 0 &&
    !overAllocated &&
    (mode === "AUTO" || Object.values(allocations).some((v) => Number(v) > 0));

  const setAllocation = (invoiceId: string, value: string) =>
    setAllocations((current) => ({ ...current, [invoiceId]: value }));

  /**
   * Switching to manual starts from what the automatic plan would have done.
   *
   * Adjusting one line of a sensible default is far less work than filling in
   * every line from nothing, and it keeps the two modes agreeing until the
   * operator deliberately changes something.
   */
  const enterManual = () => {
    if (Object.keys(allocations).length === 0) {
      const seeded: Record<string, string> = {};
      for (const row of autoPlan.rows) seeded[row.invoice.id] = row.amount;
      setAllocations(seeded);
    }
    setMode("MANUAL");
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const manual = Object.entries(allocations)
        .filter(([, value]) => value && Number(value) > 0)
        .map(([invoiceId, value]) => ({
          supplier_invoice: invoiceId,
          amount: value,
        }));

      const payment = await api.post<SupplierPayment>(
        "/purchasing/supplier-payments/",
        {
          supplier: supplier.id,
          amount,
          method,
          payment_date: paymentDate || undefined,
          payment_reference: paymentReference,
          bank_reference: bankReference,
          bank_account: bankAccount,
          notes,
          // Exactly one of these is sent: the server refuses both together,
          // since they are contradictory instructions about where money goes.
          ...(mode === "MANUAL" ? { allocations: manual } : {}),
        },
      );
      toast.success(t.toasts.created, payment.reference);
      router.push(`/purchasing/supplier-payments/${payment.id}`);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error(translateErrorDetailed(apiError, t) ?? t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.payables.newPayment}</h1>
        <p className="text-sm text-muted-foreground">
          {t.payables.supplierPaymentsSubtitle}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateErrorDetailed(error, t)}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.payables.supplierPayment}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t.purchasing.supplier} required>
            <EntityPicker<Supplier>
              path="/partners/suppliers/"
              value={supplier}
              onChange={setSupplier}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getSublabel={(item) => item.supplier_code}
            />
          </Field>

          <Field label={t.payables.amountPaid} required>
            <Input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <Field label={t.payables.paymentDate}>
            <Input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </Field>

          <Field label={t.payables.paymentMethod}>
            <Select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {Object.entries(t.paymentMethods).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.payables.paymentReference}
            hint={t.payables.paymentReferenceHint}
          >
            <Input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
            />
          </Field>

          <Field
            label={t.payables.bankReference}
            hint={t.payables.bankReferenceHint}
          >
            <Input
              value={bankReference}
              onChange={(event) => setBankReference(event.target.value)}
            />
          </Field>

          <Field label={t.payables.bankAccount}>
            <Input
              value={bankAccount}
              onChange={(event) => setBankAccount(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.payables.selectInvoices}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "AUTO" ? (
            loadingInvoices ? (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            ) : !supplier ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.payables.selectSupplierFirst}
              </p>
            ) : openInvoices.length === 0 ? (
              <Alert variant="warning">
                {t.payables.noOutstandingInvoicesOnAccount}
              </Alert>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t.payables.autoAllocationHint}
                </p>

                {autoPlan.rows.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    {t.payables.enterAmountToPreview}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {autoPlan.rows.map(({ invoice, amount: applied }) => {
                      const settlesFully =
                        money.compare(applied, invoice.balance_due) >= 0;
                      return (
                        <div
                          key={invoice.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-medium">
                                {invoice.invoice_number}
                              </span>
                              {invoice.is_overdue && (
                                <Badge variant="destructive">
                                  {invoice.days_overdue}{" "}
                                  {t.payables.daysOverdue.toLowerCase()}
                                </Badge>
                              )}
                              <Badge
                                variant={settlesFully ? "success" : "secondary"}
                              >
                                {settlesFully
                                  ? t.payables.willBeSettled
                                  : t.payables.willBePartlyPaid}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t.payables.dueDate}: {formatDate(invoice.due_date)}
                              {" · "}
                              {t.payables.balanceDue}:{" "}
                              {fmt.money(invoice.balance_due)}
                            </p>
                          </div>
                          <span className="font-medium tabular-nums">
                            {fmt.money(applied)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {money.compare(autoPlan.leftover, "0") > 0 && (
                  <Alert variant="warning">
                    {t.payables.leftOnAccount.replace(
                      "%{amount}",
                      fmt.money(autoPlan.leftover),
                    )}
                  </Alert>
                )}

                <Button variant="ghost" size="sm" onClick={enterManual}>
                  {t.payables.adjustAllocation}
                </Button>
              </div>
            )
          ) : loadingInvoices ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : openInvoices.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {supplier
                ? t.payables.noOutstandingInvoices
                : t.payables.selectInvoices}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {t.payables.chooseInvoicesHint}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Drop the manual figures so the automatic plan is what
                    // gets sent — leaving them would show one thing and do
                    // another.
                    setAllocations({});
                    setMode("AUTO");
                  }}
                >
                  {t.payables.backToAutomatic}
                </Button>
              </div>
              {openInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-12 sm:items-center"
                >
                  <div className="sm:col-span-5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">
                        {invoice.invoice_number}
                      </span>
                      {invoice.is_overdue && (
                        <Badge variant="destructive">
                          {invoice.days_overdue}{" "}
                          {t.payables.daysOverdue.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.payables.dueDate}: {formatDate(invoice.due_date)}
                    </p>
                    <div className="mt-1 max-w-[12rem]">
                      <Progress
                        value={invoice.payment_progress}
                        showValue={false}
                        tone={invoice.is_overdue ? "danger" : "default"}
                      />
                    </div>
                  </div>

                  <div className="text-right sm:col-span-3">
                    <p className="text-xs text-muted-foreground">
                      {t.payables.balanceDue}
                    </p>
                    <p className="font-medium tabular-nums">
                      {fmt.money(invoice.balance_due)}
                    </p>
                  </div>

                  <div className="sm:col-span-4">
                    <Field label={t.payables.allocate}>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={allocations[invoice.id] ?? ""}
                          onChange={(event) =>
                            setAllocation(invoice.id, event.target.value)
                          }
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setAllocation(invoice.id, invoice.balance_due)
                          }
                        >
                          {t.common.all}
                        </Button>
                      </div>
                    </Field>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">
                  {t.payables.allocatedAmount}
                </span>
                <span className="font-medium tabular-nums">
                  {fmt.money(allocatedTotal)}
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {t.payables.remainingToAllocate}
                </span>
                <span
                  className={`font-medium tabular-nums ${
                    overAllocated ? "text-destructive" : ""
                  }`}
                >
                  {fmt.money(remaining)}
                </span>
              </div>

              {overAllocated && (
                <Alert variant="destructive">
                  {t.payables.allocationExceedsPayment}
                </Alert>
              )}
              {!overAllocated && Number(remaining) > 0 && (
                <Alert variant="warning">{t.payables.unallocatedHint}</Alert>
              )}
            </div>
          )}
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
