"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { Expense, ExpenseCategory, Supplier } from "@/lib/api/types";
import { translateErrorDetailed, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Expense form, shared by the create and edit routes.
 *
 * One component rather than two so a field added here appears on both paths;
 * the alternative reliably drifts, and an expense recorded through one route
 * would end up carrying different data from one recorded through the other.
 */
export function ExpenseForm({ expense }: { expense?: Expense }) {
  const t = useTranslation();
  const router = useRouter();
  const isEdit = Boolean(expense);

  const categories = useQuery<Paginated<ExpenseCategory>>(
    "/accounting/expense-categories/",
    { page_size: 100, is_active: true },
  );

  const [category, setCategory] = useState(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [amount, setAmount] = useState(expense?.amount ?? "");
  const [taxAmount, setTaxAmount] = useState(expense?.tax_amount ?? "");
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10),
  );
  const [paidDate, setPaidDate] = useState(expense?.paid_date ?? "");
  const [paymentMethod, setPaymentMethod] = useState(
    expense?.payment_method ?? "CASH",
  );
  const [paymentReference, setPaymentReference] = useState(
    expense?.payment_reference ?? "",
  );
  const [payee, setPayee] = useState(expense?.payee ?? "");
  const [receiptNumber, setReceiptNumber] = useState(
    expense?.receipt_number ?? "",
  );
  const [supplier, setSupplier] = useState<Supplier | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const canSubmit = category && description.trim() && Number(amount) > 0;

  /**
   * Marks a field as optional in its hint.
   *
   * Repeated per field rather than left to the banner alone: the operator
   * reading a specific field is looking at that field, not at the top of the
   * page, and an unlabelled empty box is what makes people hunt for
   * information they were never required to supply.
   */
  const optional = (hint?: string) =>
    hint
      ? t.accounting.optionalWithHint.replace("%{hint}", hint)
      : t.accounting.optionalHint;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const body = {
      category,
      description: description.trim(),
      notes,
      amount,
      tax_amount: taxAmount || undefined,
      expense_date: expenseDate || undefined,
      // Explicit null clears a payment date on edit; undefined would leave it
      // untouched, which is not the same thing.
      paid_date: paidDate || null,
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      payee,
      receipt_number: receiptNumber,
      supplier: supplier?.id ?? null,
    };

    try {
      const saved = isEdit
        ? await api.patch<Expense>(`/accounting/expenses/${expense!.id}/`, body)
        : await api.post<Expense>("/accounting/expenses/", body);
      toast.success(isEdit ? t.toasts.updated : t.toasts.created, saved.reference);
      router.push(`/accounting/expenses/${saved.id}`);
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
          {isEdit ? t.accounting.editExpense : t.accounting.newExpense}
        </h1>
        <p className="text-sm text-muted-foreground">{t.accounting.expenses}</p>
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateErrorDetailed(error, t)}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.accounting.expense}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t.accounting.category} required>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">—</option>
              {(categories.data?.results ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.accounting.amount} required>
            <Input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label={t.accounting.description}
              hint={t.accounting.descriptionHint}
              required
            >
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>

          <Field label={t.accounting.taxAmount} hint={optional()}>
            <Input
              type="number"
              min="0"
              step="any"
              value={taxAmount}
              onChange={(event) => setTaxAmount(event.target.value)}
            />
          </Field>

          <Field
            label={t.accounting.payee}
            hint={optional(t.accounting.payeeHint)}
          >
            <Input
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
            />
          </Field>

          {/* Dated today unless changed, so it is never blank — but the
              operator may still correct it, which is why it is not marked
              required either. */}
          <Field
            label={t.accounting.expenseDate}
            hint={t.accounting.expenseDateHint}
          >
            <Input
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
          </Field>

          <Field
            label={t.accounting.paidDate}
            hint={optional(t.accounting.paidDateHint)}
          >
            <Input
              type="date"
              value={paidDate}
              onChange={(event) => setPaidDate(event.target.value)}
            />
          </Field>

          <Field label={t.payables.paymentMethod}>
            <Select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {Object.entries(t.paymentMethods).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.payables.paymentReference} hint={optional()}>
            <Input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
            />
          </Field>

          <Field label={t.accounting.receiptNumber} hint={optional()}>
            <Input
              value={receiptNumber}
              onChange={(event) => setReceiptNumber(event.target.value)}
            />
          </Field>

          <Field
            label={t.accounting.relatedSupplier}
            hint={optional(t.accounting.relatedSupplierHint)}
          >
            <EntityPicker<Supplier>
              path="/partners/suppliers/"
              value={supplier}
              onChange={setSupplier}
              getKey={(item) => item.id}
              getLabel={(item) => item.name}
              getSublabel={(item) => item.supplier_code}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.accounting.notes}</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label={t.accounting.notes}
            hint={optional(t.accounting.notesHint)}
          >
            <Textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
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
