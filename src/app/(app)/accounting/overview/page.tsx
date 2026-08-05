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
} from "@/components/ui/primitives";
import { DetailPageSkeleton } from "@/components/ui/skeletons";
import type { FinancialOverview } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

/** First of the current month through today — the period a manager asks about. */
function defaultWindow() {
  const today = new Date();
  return {
    from: new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function Figure({
  label,
  value,
  tone = "default",
  large = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "muted";
  large?: boolean;
}) {
  const tones = {
    default: "",
    positive: "text-emerald-600 dark:text-emerald-500",
    negative: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${large ? "text-lg font-semibold" : "font-medium"} ${tones[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Financial overview: money in, money out, and what it leaves.
 *
 * Presented as three columns in the order the question is actually asked —
 * what came in, what went out, what remains — rather than as a statutory P&L
 * layout. Every figure is derived at read time from the sales, expenses and
 * payments already recorded, so nothing here can drift from the documents
 * behind it.
 */
export default function FinancialOverviewPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const initial = defaultWindow();

  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);

  const overview = useQuery<FinancialOverview>("/accounting/overview/", {
    date_from: dateFrom,
    date_to: dateTo,
  });

  const data = overview.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.accounting.overview}</h1>
        <p className="text-sm text-muted-foreground">{t.nav.accounting}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          <Field label={t.reports.dateFrom} className="w-44">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field label={t.reports.dateTo} className="w-44">
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {overview.loading ? (
        <DetailPageSkeleton />
      ) : overview.error || !data ? (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {overview.error ? translateError(overview.error, t) : t.accounting.noData}
        </Alert>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t.accounting.moneyIn}</CardTitle>
              </CardHeader>
              <CardContent>
                <Figure
                  label={t.accounting.grossRevenue}
                  value={fmt.money(data.gross_revenue)}
                />
                <Figure
                  label={t.accounting.salesTax}
                  value={`− ${fmt.money(data.sales_tax)}`}
                  tone="muted"
                />
                <div className="border-t border-border pt-1.5">
                  <Figure
                    label={t.accounting.netRevenue}
                    value={fmt.money(data.net_revenue)}
                    large
                  />
                </div>
                <Figure
                  label={t.accounting.costOfGoodsSold}
                  value={`− ${fmt.money(data.cost_of_goods)}`}
                  tone="muted"
                />
                <div className="border-t border-border pt-1.5">
                  <Figure
                    label={t.accounting.grossProfit}
                    value={fmt.money(data.gross_profit)}
                    tone="positive"
                    large
                  />
                </div>
                <Figure
                  label={t.accounting.grossMargin}
                  value={`${Number(data.gross_margin_percent).toFixed(1)}%`}
                  tone="muted"
                />
                <Figure
                  label={t.accounting.salesCount}
                  value={String(data.sales_count)}
                  tone="muted"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.accounting.moneyOut}</CardTitle>
              </CardHeader>
              <CardContent>
                <Figure
                  label={t.accounting.operatingExpenses}
                  value={fmt.money(data.operating_expenses)}
                />
                <Figure
                  label={t.accounting.supplierPayments}
                  value={fmt.money(data.supplier_payments)}
                />
                <div className="border-t border-border pt-1.5">
                  <Figure
                    label={t.accounting.totalCashOutflow}
                    value={fmt.money(data.total_cash_outflow)}
                    tone="negative"
                    large
                  />
                </div>
                <Figure
                  label={t.accounting.unpaidExpenses}
                  value={fmt.money(data.unpaid_expenses)}
                  tone="muted"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.accounting.result}</CardTitle>
              </CardHeader>
              <CardContent>
                <Figure
                  label={t.accounting.grossProfit}
                  value={fmt.money(data.gross_profit)}
                />
                <Figure
                  label={t.accounting.operatingExpenses}
                  value={`− ${fmt.money(data.operating_expenses)}`}
                  tone="muted"
                />
                <div className="border-t border-border pt-1.5">
                  <Figure
                    label={t.accounting.operatingResult}
                    value={fmt.money(data.operating_result)}
                    tone={
                      Number(data.operating_result) >= 0 ? "positive" : "negative"
                    }
                    large
                  />
                </div>
                <Figure
                  label={t.accounting.operatingMargin}
                  value={`${Number(data.operating_margin_percent).toFixed(1)}%`}
                  tone="muted"
                />

                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.accounting.position}
                  </p>
                  <Figure
                    label={t.accounting.outstandingPayables}
                    value={fmt.money(data.outstanding_payables)}
                    tone={
                      Number(data.outstanding_payables) > 0 ? "negative" : "default"
                    }
                  />
                  <Figure
                    label={t.accounting.suppliersOwed}
                    value={String(data.supplier_count_owed)}
                    tone="muted"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
