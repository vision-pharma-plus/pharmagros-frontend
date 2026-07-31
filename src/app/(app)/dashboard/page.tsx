"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Coins,
  Package,
  PackageX,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/primitives";
import { ChartSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import type { DashboardKPIs, DashboardWidgets } from "@/lib/api/types";
import {
  formatDate,
  formatDays,
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
} from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";

function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "destructive" | "success";
  hint?: string;
}) {
  const toneClasses = {
    default: "text-muted-foreground",
    warning: "text-warning",
    destructive: "text-destructive",
    success: "text-success",
  } as const;

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <div className="rounded-md bg-muted p-2">
          <Icon className={`h-5 w-5 ${toneClasses[tone]}`} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
            {value}
          </p>
          {hint && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const t = useTranslation();
  const { locale } = useLocale();

  const kpis = useQuery<DashboardKPIs>("/reporting/dashboard/");
  const widgets = useQuery<DashboardWidgets>("/reporting/dashboard/widgets/", {
    days: 30,
  });

  const error = translateError(kpis.error, t);

  if (error) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        <p className="mb-3">{error}</p>
        <Button size="sm" variant="outline" onClick={kpis.refetch}>
          {t.common.retry}
        </Button>
      </Alert>
    );
  }

  const data = kpis.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
        {data && (
          <p className="text-sm text-muted-foreground">
            {formatDate(data.as_of)}
          </p>
        )}
      </div>

      {kpis.loading || !data ? (
        // Nine tiles is what every user sees; the valuation and margin tiles
        // are permission-gated, so this is the count that avoids a jump for
        // the common case.
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Inventory value is only present when the user holds
                inventory.view_valuation — the API strips it otherwise. */}
            {data.inventory.total_value !== undefined && (
              <KpiTile
                label={t.dashboard.inventoryValue}
                value={formatMoneyCompact(data.inventory.total_value, locale)}
                icon={Coins}
                tone="success"
              />
            )}
            <KpiTile
              label={t.dashboard.totalProducts}
              value={String(data.inventory.total_products)}
              icon={Package}
              hint={`${data.inventory.total_batches} ${t.nav.batches.toLowerCase()}`}
            />
            <KpiTile
              label={t.dashboard.lowStock}
              value={String(data.inventory.low_stock_products)}
              icon={Boxes}
              tone={data.inventory.low_stock_products > 0 ? "warning" : "default"}
            />
            <KpiTile
              label={t.dashboard.outOfStock}
              value={String(data.inventory.out_of_stock_products)}
              icon={PackageX}
              tone={
                data.inventory.out_of_stock_products > 0
                  ? "destructive"
                  : "default"
              }
            />
            <KpiTile
              label={t.dashboard.expiringSoon}
              value={String(data.inventory.expiring_90_days)}
              icon={CalendarClock}
              tone={data.inventory.expiring_90_days > 0 ? "warning" : "default"}
              hint={formatDays(90, locale)}
            />
            <KpiTile
              label={t.dashboard.expiredBatches}
              value={String(data.inventory.expired_batches)}
              icon={AlertTriangle}
              tone={data.inventory.expired_batches > 0 ? "destructive" : "default"}
            />
            <KpiTile
              label={t.dashboard.dailySales}
              value={formatMoneyCompact(data.sales.daily_revenue, locale)}
              icon={TrendingUp}
              hint={`${data.sales.daily_transactions} ${t.dashboard.transactions}`}
            />
            <KpiTile
              label={t.dashboard.monthlySales}
              value={formatMoneyCompact(data.sales.monthly_revenue, locale)}
              icon={TrendingUp}
              hint={`${data.sales.monthly_transactions} ${t.dashboard.transactions}`}
            />
            <KpiTile
              label={t.dashboard.outstandingInvoices}
              value={formatMoneyCompact(
                data.receivables.outstanding_total,
                locale,
              )}
              icon={Receipt}
              hint={`${data.receivables.outstanding_count} ${t.nav.invoices.toLowerCase()}`}
            />
            <KpiTile
              label={t.dashboard.overdueInvoices}
              value={formatMoneyCompact(data.receivables.overdue_total, locale)}
              icon={AlertTriangle}
              tone={
                data.receivables.overdue_count > 0 ? "destructive" : "default"
              }
              hint={`${data.receivables.overdue_count} ${t.nav.invoices.toLowerCase()}`}
            />
            {/* Margin appears only for users holding sales.view_margin. */}
            {data.sales.monthly_margin !== undefined && (
              <KpiTile
                label={t.dashboard.monthlyMargin}
                value={formatMoneyCompact(data.sales.monthly_margin, locale)}
                icon={Coins}
                tone="success"
              />
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.dashboard.revenueTrend}</CardTitle>
            </CardHeader>
            <CardContent>
              {widgets.loading ? (
                <ChartSkeleton />
              ) : widgets.data && widgets.data.revenue_trend.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={widgets.data.revenue_trend.map((point) => ({
                        date: formatDate(point.date),
                        // Recharts needs numbers to plot. Safe here because
                        // this is a visual trend, not a displayed figure —
                        // every exact amount on screen still comes from the
                        // decimal string.
                        revenue: Number(point.revenue),
                      }))}
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        tickFormatter={(value: number) =>
                          formatMoneyCompact(String(value), locale, {
                            showCurrency: false,
                          })
                        }
                      />
                      <Tooltip
                        formatter={(value: number) => formatMoney(String(value))}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title={t.dashboard.noDataForPeriod} />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.dashboard.topCustomers}</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {widgets.loading ? (
                  <TableSkeleton columns={2} rows={5} />
                ) : widgets.data && widgets.data.top_customers.length > 0 ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>{t.partners.businessName}</TH>
                        <TH numeric>{t.common.total}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {widgets.data.top_customers.map((customer) => (
                        <TR key={customer.customer_id}>
                          <TD>
                            <span className="font-medium">
                              {customer.business_name}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {customer.customer_code}
                            </span>
                          </TD>
                          <TD numeric>{formatMoney(customer.revenue)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <EmptyState title={t.common.noResults} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.dashboard.topProducts}</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {widgets.loading ? (
                  <TableSkeleton columns={3} rows={5} />
                ) : widgets.data && widgets.data.top_products.length > 0 ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>{t.catalog.name}</TH>
                        <TH numeric>{t.common.quantity}</TH>
                        <TH numeric>{t.common.total}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {widgets.data.top_products.map((product) => (
                        <TR key={product.product_id}>
                          <TD>
                            <span className="font-medium">{product.name}</span>
                          </TD>
                          <TD numeric>
                            {formatQuantity(product.quantity_sold)}
                          </TD>
                          <TD numeric>{formatMoney(product.revenue)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <EmptyState title={t.common.noResults} />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
