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
import { useState } from "react";
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
  Field,
  Input,
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
import { formatDate } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
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

/** Local yyyy-MM-dd. `toISOString` would shift the date across the UTC line. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type PresetKey = "today" | "month" | "last30" | "year";

/**
 * The ranges people actually ask for, resolved against the browser's clock.
 *
 * Kept as functions rather than constants so a dashboard left open overnight
 * does not keep filtering to yesterday.
 */
const PRESETS: Record<PresetKey, () => { from: string; to: string }> = {
  today: () => {
    const now = new Date();
    return { from: isoDate(now), to: isoDate(now) };
  },
  month: () => {
    const now = new Date();
    return {
      from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: isoDate(now),
    };
  },
  last30: () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: isoDate(start), to: isoDate(now) };
  },
  year: () => {
    const now = new Date();
    return {
      from: isoDate(new Date(now.getFullYear(), 0, 1)),
      to: isoDate(now),
    };
  },
};

export default function DashboardPage() {
  const t = useTranslation();
  // Locale-bound formatters, so every figure on this page follows the active
  // language without each call site having to remember to pass it.
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);

  // Empty means "no filter": the API then applies its own defaults (today for
  // the daily tile, month-to-date for the monthly one) and the tiles keep
  // their original labels.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const applyPreset = (key: PresetKey) => {
    const { from, to } = PRESETS[key]();
    setDateFrom(from);
    setDateTo(to);
  };

  const clearPeriod = () => {
    setDateFrom("");
    setDateTo("");
  };

  /** Which preset, if any, the current range corresponds to. */
  const activePreset = (["today", "month", "last30", "year"] as PresetKey[]).find(
    (key) => {
      const { from, to } = PRESETS[key]();
      return dateFrom === from && dateTo === to;
    },
  );

  const hasPeriod = Boolean(dateFrom || dateTo);

  /**
   * A destination, or undefined when the user cannot open it.
   *
   * The dashboard is visible to anyone holding `reporting.view_dashboard`,
   * which does not imply the module permissions the drill-downs need — a
   * cashier sees the receivables tiles without holding `invoicing.view_invoice`.
   */
  const drill = (permission: string, href: string) =>
    can(permission) ? href : undefined;

  // Both queries take the same window, so the chart and the top-N tables
  // below the tiles always cover the period the tiles report.
  const range = {
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const kpis = useQuery<DashboardKPIs>("/reporting/dashboard/", range);
  const widgets = useQuery<DashboardWidgets>("/reporting/dashboard/widgets/", {
    days: 30,
    ...range,
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.dashboard.period}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", t.dashboard.periodToday],
                ["month", t.dashboard.periodThisMonth],
                ["last30", t.dashboard.periodLast30],
                ["year", t.dashboard.periodThisYear],
              ] as [PresetKey, string][]
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={activePreset === key ? "default" : "outline"}
                onClick={() => applyPreset(key)}
                aria-pressed={activePreset === key}
              >
                {label}
              </Button>
            ))}
            {hasPeriod && (
              <Button size="sm" variant="ghost" onClick={clearPeriod}>
                {t.dashboard.resetPeriod}
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <Field label={t.dashboard.periodFrom}>
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </Field>
            <Field label={t.dashboard.periodTo}>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </Field>
          </div>

          {/* Said once, here, rather than on each position tile: the filter
              moves the sales figures but not stock or receivables, and a user
              who does not know that will read the unchanged tiles as a bug. */}
          {hasPeriod && (
            <p className="text-xs text-muted-foreground">
              {t.dashboard.positionsAsOfNow}
            </p>
          )}
        </CardContent>
      </Card>

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
                value={fmt.moneyCompact(data.inventory.total_value)}
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
              hint={fmt.days(90)}
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
            {/* Without a filter these are two different windows — today and
                the month to date. With one they would be the same figure
                twice, so the daily tile drops out rather than repeating it. */}
            {!data.sales.is_filtered && (
              <KpiTile
                label={t.dashboard.dailySales}
                value={fmt.moneyCompact(data.sales.daily_revenue)}
                icon={TrendingUp}
                hint={`${data.sales.daily_transactions} ${t.dashboard.transactions}`}
                href={drill("sales.view_sale", "/sales")}
                drillLabel={t.nav.salesList}
              />
            )}
            <KpiTile
              label={
                data.sales.is_filtered
                  ? t.dashboard.salesForPeriod
                  : t.dashboard.monthlySales
              }
              value={fmt.moneyCompact(data.sales.monthly_revenue)}
              icon={TrendingUp}
              hint={`${data.sales.monthly_transactions} ${t.dashboard.transactions}`}
              href={drill("sales.view_sale", "/sales")}
              drillLabel={t.nav.salesList}
            />
            <KpiTile
              label={t.dashboard.outstandingInvoices}
              value={fmt.moneyCompact(data.receivables.outstanding_total)}
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
              value={fmt.moneyCompact(data.receivables.overdue_total)}
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
                label={
                  data.sales.is_filtered
                    ? t.dashboard.marginForPeriod
                    : t.dashboard.monthlyMargin
                }
                value={fmt.moneyCompact(data.sales.monthly_margin)}
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
                          fmt.moneyCompact(String(value), {
                            showCurrency: false,
                          })
                        }
                      />
                      <Tooltip
                        formatter={(value: number) => fmt.money(String(value))}
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
                            <TD numeric>{fmt.money(customer.revenue)}</TD>
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
                              {fmt.quantity(product.quantity_sold)}
                            </TD>
                            <TD numeric>{fmt.money(product.revenue)}</TD>
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
