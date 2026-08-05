"use client";

import { useState } from "react";

import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Progress,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { TableCardSkeleton } from "@/components/ui/skeletons";
import type {
  CashOutflowReport,
  ExpenseCategoryReport,
  OutstandingBalancesReport,
  SupplierPaymentReport,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

type ReportKey = "EXPENSES" | "PAYMENTS" | "BALANCES" | "OUTFLOW";

function defaultWindow() {
  const today = new Date();
  return {
    from: new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

/**
 * The four accounting reports, behind one date filter.
 *
 * Kept on a single screen with a switcher rather than four routes: they answer
 * neighbouring questions over the same period, and an accountant reading one
 * almost always wants the next. A shared window means switching does not mean
 * re-entering dates.
 */
export default function AccountingReportsPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const initial = defaultWindow();

  const [report, setReport] = useState<ReportKey>("EXPENSES");
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);

  const range = { date_from: dateFrom, date_to: dateTo };

  const expenses = useQuery<ExpenseCategoryReport>(
    report === "EXPENSES" ? "/accounting/reports/expenses-by-category/" : null,
    range,
  );
  const payments = useQuery<SupplierPaymentReport>(
    report === "PAYMENTS" ? "/accounting/reports/supplier-payments/" : null,
    range,
  );
  const balances = useQuery<OutstandingBalancesReport>(
    report === "BALANCES" ? "/accounting/reports/outstanding-balances/" : null,
    { as_of: dateTo },
  );
  const outflow = useQuery<CashOutflowReport>(
    report === "OUTFLOW" ? "/accounting/reports/cash-outflow/" : null,
    range,
  );

  const active =
    report === "EXPENSES"
      ? expenses
      : report === "PAYMENTS"
        ? payments
        : report === "BALANCES"
          ? balances
          : outflow;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.accounting.reports}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.accounting}</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Segmented<ReportKey>
            value={report}
            onChange={setReport}
            ariaLabel={t.accounting.reports}
            options={[
              {
                value: "EXPENSES",
                label: t.accounting.expensesByCategory,
                content: t.accounting.expensesByCategory,
              },
              {
                value: "PAYMENTS",
                label: t.accounting.supplierPaymentReport,
                content: t.accounting.supplierPaymentReport,
              },
              {
                value: "BALANCES",
                label: t.accounting.outstandingBalancesReport,
                content: t.accounting.outstandingBalancesReport,
              },
              {
                value: "OUTFLOW",
                label: t.accounting.cashOutflowReport,
                content: t.accounting.cashOutflowReport,
              },
            ]}
          />

          <div className="flex flex-wrap gap-4">
            {report !== "BALANCES" && (
              <Field label={t.reports.dateFrom} className="w-44">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </Field>
            )}
            <Field
              label={report === "BALANCES" ? t.common.date : t.reports.dateTo}
              className="w-44"
            >
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {active.loading ? (
        <TableCardSkeleton />
      ) : active.error ? (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateError(active.error, t)}
        </Alert>
      ) : (
        <>
          {report === "EXPENSES" && expenses.data && (
            <Card>
              <CardHeader>
                <CardTitle>{t.accounting.expensesByCategory}</CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.data.categories.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t.accounting.noExpenses}
                  </p>
                ) : (
                  <>
                    <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
                      <span className="text-sm text-muted-foreground">
                        {t.common.total}
                      </span>
                      <span className="text-xl font-semibold tabular-nums">
                        {fmt.money(expenses.data.total_amount)}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <TR>
                            <TH>{t.accounting.category}</TH>
                            <TH numeric>{t.accounting.expenses}</TH>
                            <TH numeric>{t.accounting.amount}</TH>
                            <TH>{t.accounting.shareOfTotal}</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {expenses.data.categories.map((row) => (
                            <TR key={row.category_id}>
                              <TD>
                                <span className="font-medium">
                                  {row.category_name}
                                </span>
                              </TD>
                              <TD numeric>{row.expense_count}</TD>
                              <TD numeric>{fmt.money(row.total_amount)}</TD>
                              <TD>
                                <div className="w-32">
                                  <Progress value={row.percentage} />
                                </div>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {report === "PAYMENTS" && payments.data && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      {t.payables.totalPaid}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {fmt.money(payments.data.total_paid)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      {t.payables.allocatedAmount}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {fmt.money(payments.data.total_allocated)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      {t.payables.unallocatedAmount}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-500">
                      {fmt.money(payments.data.total_unallocated)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {payments.data.reversed_count > 0 && (
                <Alert variant="warning">
                  {t.accounting.reversedPayments.replace(
                    "%{count}",
                    String(payments.data.reversed_count),
                  )}
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>{t.accounting.bySupplier}</CardTitle>
                </CardHeader>
                <CardContent>
                  {payments.data.suppliers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t.accounting.noData}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <TR>
                            <TH>{t.purchasing.supplier}</TH>
                            <TH numeric>{t.payables.supplierPayments}</TH>
                            <TH numeric>{t.payables.totalPaid}</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {payments.data.suppliers.map((row) => (
                            <TR key={row.supplier_id}>
                              <TD>
                                <p className="font-medium">{row.supplier_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.supplier_code}
                                </p>
                              </TD>
                              <TD numeric>{row.payment_count}</TD>
                              <TD numeric>{fmt.money(row.total_paid)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.accounting.byMethod}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>{t.payables.paymentMethod}</TH>
                          <TH numeric>{t.payables.supplierPayments}</TH>
                          <TH numeric>{t.payables.totalPaid}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {payments.data.methods.map((row) => (
                          <TR key={row.method}>
                            <TD>
                              {t.paymentMethods[
                                row.method as keyof typeof t.paymentMethods
                              ] ?? row.method}
                            </TD>
                            <TD numeric>{row.payment_count}</TD>
                            <TD numeric>{fmt.money(row.total_paid)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {report === "BALANCES" && balances.data && (
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>{t.accounting.ageing}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
                    <span className="text-sm text-muted-foreground">
                      {t.payables.totalOutstanding}
                    </span>
                    <span className="text-xl font-semibold tabular-nums">
                      {fmt.money(balances.data.total_outstanding)}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-5">
                    {(
                      [
                        ["ageingCurrent", balances.data.ageing.current],
                        ["ageing1to30", balances.data.ageing.days_1_30],
                        ["ageing31to60", balances.data.ageing.days_31_60],
                        ["ageing61to90", balances.data.ageing.days_61_90],
                        ["ageingOver90", balances.data.ageing.days_over_90],
                      ] as const
                    ).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground">
                          {t.accounting[key]}
                        </p>
                        <p className="font-semibold tabular-nums">
                          {fmt.money(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.payables.outstandingBalances}</CardTitle>
                </CardHeader>
                <CardContent>
                  {balances.data.suppliers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t.payables.noOutstanding}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <TR>
                            <TH>{t.purchasing.supplier}</TH>
                            <TH numeric>{t.payables.invoiceCount}</TH>
                            <TH>{t.payables.oldestDue}</TH>
                            <TH numeric>{t.payables.overdueAmount}</TH>
                            <TH numeric>{t.payables.outstandingBalance}</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {balances.data.suppliers.map((row) => (
                            <TR key={row.supplier_id}>
                              <TD>
                                <p className="font-medium">{row.supplier_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.supplier_code}
                                </p>
                              </TD>
                              <TD numeric>{row.invoice_count}</TD>
                              <TD>{formatDate(row.oldest_due_date)}</TD>
                              <TD numeric>
                                {Number(row.overdue_amount) > 0 ? (
                                  <span className="font-medium text-destructive">
                                    {fmt.money(row.overdue_amount)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TD>
                              <TD numeric>
                                {fmt.money(row.outstanding_balance)}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {report === "OUTFLOW" && outflow.data && (
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>{t.accounting.cashOutflowReport}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
                    <span className="text-sm text-muted-foreground">
                      {t.accounting.totalCashOutflow}
                    </span>
                    <span className="text-xl font-semibold tabular-nums text-destructive">
                      {fmt.money(outflow.data.total_outflow)}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>{t.accounting.bySource}</TH>
                          <TH numeric>{t.common.total}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {outflow.data.breakdown.map((row) => (
                          <TR key={row.source}>
                            <TD>
                              {t.accounting[
                                row.source as "SUPPLIER_PAYMENTS" | "EXPENSES"
                              ] ?? row.source}
                            </TD>
                            <TD numeric>{fmt.money(row.total_amount)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>

                  {Number(outflow.data.unpaid_expenses_total) > 0 && (
                    <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3 text-sm">
                      <span className="text-muted-foreground">
                        {t.accounting.unpaidExpenses}
                      </span>
                      <span className="font-medium tabular-nums text-amber-600 dark:text-amber-500">
                        {fmt.money(outflow.data.unpaid_expenses_total)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.accounting.expensesByCategory}</CardTitle>
                </CardHeader>
                <CardContent>
                  {outflow.data.expenses_by_category.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t.accounting.noExpenses}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <TR>
                            <TH>{t.accounting.category}</TH>
                            <TH numeric>{t.accounting.expenses}</TH>
                            <TH numeric>{t.accounting.amount}</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {outflow.data.expenses_by_category.map((row) => (
                            <TR key={row.category_code}>
                              <TD>{row.category_name}</TD>
                              <TD numeric>{row.expense_count}</TD>
                              <TD numeric>{fmt.money(row.total_amount)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
