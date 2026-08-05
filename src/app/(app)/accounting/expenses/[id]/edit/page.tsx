"use client";

import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import { FormPageSkeleton } from "@/components/ui/skeletons";
import type { Expense } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

import { ExpenseForm } from "../../expense-form";

export default function EditExpensePage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const expense = useQuery<Expense>(`/accounting/expenses/${params.id}/`);

  if (expense.loading) return <FormPageSkeleton />;
  if (expense.error || !expense.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {expense.error ? translateError(expense.error, t) : t.errors.not_found}
      </Alert>
    );
  }

  // A settled or cancelled expense is history: the server refuses the edit, so
  // the form is not offered rather than shown and then rejected on save.
  if (!expense.data.is_editable) {
    return (
      <Alert variant="warning" title={t.accounting.editExpense}>
        {t.status[expense.data.status as keyof typeof t.status] ??
          expense.data.status}
      </Alert>
    );
  }

  return <ExpenseForm expense={expense.data} />;
}
