"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ChevronRight,
  Coins,
  Package,
  PackageX,
  Receipt,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useAuth } from "@/lib/stores/auth";

/**
 * A single KPI.
 *
 * Every figure here is a summary of rows that exist somewhere else, so the
 * tile links to the list it was counted from — filtered to the same
 * population, so the destination reconciles with the number that was clicked.
 * `href` is omitted when the user cannot open the target: a tile that
 * navigates to a permission error is worse than one that does not move.
 */
function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  href,
  drillLabel,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "destructive" | "success";
  hint?: string;
  href?: string;
  /** Names the destination for screen readers, which get no hover cue. */
  drillLabel?: string;
}) {
  const toneClasses = {
    default: "text-muted-foreground",
    warning: "text-warning",
    destructive: "text-destructive",
    success: "text-success",
  } as const;

  const body = (
    <CardContent className="flex items-start gap-3 p-5">
      <div className="rounded-md bg-muted p-2">
        <Icon className={`h-5 w-5 ${toneClasses[tone]}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {href && (
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        />
      )}
    </CardContent>
  );

  if (!href) return <Card>{body}</Card>;

  return (
    <Card className="group transition-colors hover:border-primary/40 hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring">
      <Link
        href={href}
        // The whole tile is the target — the number is what the user aims at,
        // not a separate "view" link tucked underneath it.
        className="block rounded-lg focus:outline-none"
        aria-label={drillLabel ? `${label} — ${drillLabel}` : label}
      >
        {body}
      </Link>
    </Card>
  );
}

export default function DashboardPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  /**
   * A destination, or undefined when the user cannot open it.
   *
   * The dashboard is visible to anyone holding `reporting.view_dashboard`,
   * which does not imply the module permissions the drill-downs need — a
   * cashier sees the receivables tiles without holding `invoicing.view_invoice`.
   */
  const drill = (permission: string, href: string) =>
    can(permission) ? href : undefined;

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
                href={drill("inventory.view_stock", "/inventory/stock")}
                drillLabel={t.nav.stockLevels}
              />
            )}
            <KpiTile
              label={t.dashboard.totalProducts}
              value={String(data.inventory.total_products)}
              icon={Package}
              hint={`${data.inventory.total_batches} ${t.nav.batches.toLowerCase()}`}
              href={drill("catalog.view_medicine", "/catalog/medicines")}
              drillLabel={t.nav.medicines}
            />
            <KpiTile
              label={t.dashboard.lowStock}
              value={String(data.inventory.low_stock_products)}
              icon={Boxes}
              tone={data.inventory.low_stock_products > 0 ? "warning" : "default"}
              href={drill(
                "inventory.view_stock",
                "/inventory/stock?filter=low_stock",
              )}
              drillLabel={t.nav.stockLevels}
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
              href={drill(
                "inventory.view_stock",
                "/inventory/stock?filter=out_of_stock",
              )}
              drillLabel={t.nav.stockLevels}
            />
            <KpiTile
              label={t.dashboard.expiringSoon}
              value={String(data.inventory.expiring_90_days)}
              icon={CalendarClock}
              tone={data.inventory.expiring_90_days > 0 ? "warning" : "default"}
              hint={formatDays(90, locale)}
              // The horizon must match the tile's own 90 days, or the report
              // opens on a different count than the one just clicked.
              href={drill(
                "inventory.view_batch",
                "/inventory/reports/expiry?horizon=90",
              )}
              drillLabel={t.inventory.expiryHorizonReport}
            />
            <KpiTile
              label={t.dashboard.expiredBatches}
              value={String(data.inventory.expired_batches)}
              icon={AlertTriangle}
              tone={data.inventory.expired_batches > 0 ? "destructive" : "default"}
              // Expired lots hold no sellable stock, so the batches screen —
              // which drops its in_stock guard for a status filter — is the
              // only view that lists them.
              href={drill(
                "inventory.view_batch",
                "/inventory/batches?status=EXPIRED",
              )}
              drillLabel={t.nav.batches}
            />
            <KpiTile
              label={t.dashboard.dailySales}
              value={formatMoneyCompact(data.sales.daily_revenue, locale)}
              icon={TrendingUp}
              hint={`${data.sales.daily_transactions} ${t.dashboard.transactions}`}
              href={drill("sales.view_sale", "/sales")}
              drillLabel={t.nav.salesList}
            />
            <KpiTile
              label={t.dashboard.monthlySales}
              value={formatMoneyCompact(data.sales.monthly_revenue, locale)}
              icon={TrendingUp}
              hint={`${data.sales.monthly_transactions} ${t.dashboard.transactions}`}
              href={drill("sales.view_sale", "/sales")}
              drillLabel={t.nav.salesList}
            />
            <KpiTile
              label={t.dashboard.outstandingInvoices}
              value={formatMoneyCompact(
                data.receivables.outstanding_total,
                locale,
              )}
              icon={Receipt}
              hint={`${data.receivables.outstanding_count} ${t.nav.invoices.toLowerCase()}`}
              href={drill(
                "invoicing.view_invoice",
                "/invoicing/invoices?filter=unpaid",
              )}
              drillLabel={t.nav.invoices}
            />
            <KpiTile
              label={t.dashboard.overdueInvoices}
              value={formatMoneyCompact(data.receivables.overdue_total, locale)}
              icon={AlertTriangle}
              tone={
                data.receivables.overdue_count > 0 ? "destructive" : "default"
              }
              hint={`${data.receivables.overdue_count} ${t.nav.invoices.toLowerCase()}`}
              href={drill(
                "invoicing.view_invoice",
                "/invoicing/invoices?filter=overdue",
              )}
              drillLabel={t.nav.invoices}
            />
            {/* Margin appears only for users holding sales.view_margin. */}
            {data.sales.monthly_margin !== undefined && (
              <KpiTile
                label={t.dashboard.monthlyMargin}
                value={formatMoneyCompact(data.sales.monthly_margin, locale)}
                icon={Coins}
                tone="success"
                href={drill("sales.view_sale", "/sales")}
                drillLabel={t.nav.salesList}
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
                      {widgets.data.top_customers.map((customer) => {
                        const href = drill(
                          "partners.view_customer",
                          `/partners/customers/${customer.customer_id}`,
                        );
                        return (
                          <TR
                            key={customer.customer_id}
                            onClick={href ? () => router.push(href) : undefined}
                            onKeyDown={
                              href
                                ? (event) => {
                                    if (
                                      event.key !== "Enter" &&
                                      event.key !== " "
                                    )
                                      return;
                                    event.preventDefault();
                                    router.push(href);
                                  }
                                : undefined
                            }
                            tabIndex={href ? 0 : undefined}
                            role={href ? "button" : undefined}
                            className={
                              href
                                ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                : undefined
                            }
                          >
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
                        );
                      })}
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
                      {widgets.data.top_products.map((product) => {
                        const href = drill(
                          "catalog.view_medicine",
                          `/catalog/medicines/${product.product_id}`,
                        );
                        return (
                          <TR
                            key={product.product_id}
                            onClick={href ? () => router.push(href) : undefined}
                            onKeyDown={
                              href
                                ? (event) => {
                                    if (
                                      event.key !== "Enter" &&
                                      event.key !== " "
                                    )
                                      return;
                                    event.preventDefault();
                                    router.push(href);
                                  }
                                : undefined
                            }
                            tabIndex={href ? 0 : undefined}
                            role={href ? "button" : undefined}
                            className={
                              href
                                ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                : undefined
                            }
                          >
                            <TD>
                              <span className="font-medium">{product.name}</span>
                            </TD>
                            <TD numeric>
                              {formatQuantity(product.quantity_sold)}
                            </TD>
                            <TD numeric>{formatMoney(product.revenue)}</TD>
                          </TR>
                        );
                      })}
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
