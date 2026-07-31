"use client";

import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, saveBlob, type Paginated } from "@/lib/api/client";
import type {
  Category,
  CustomerListItem,
  MedicineListItem,
  User,
  Warehouse,
} from "@/lib/api/types";
import { useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

/** A filter a report is able to honour. Anything not listed is not sent. */
type FilterKey =
  | "date"
  | "warehouse"
  | "category"
  | "product"
  | "customer"
  | "salesperson";

interface ReportDefinition {
  key: string;
  path: string;
  title: string;
  description: string;
  permission: string;
  /**
   * Filters this report accepts. Sending a parameter the view ignores would
   * be harmless on the wire but misleading in the UI — a user who set a
   * warehouse would assume the valuation honoured it.
   */
  accepts: FilterKey[];
}

export default function ReportsPage() {
  const t = useTranslation();
  const can = useAuth((state) => state.can);

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [warehouse, setWarehouse] = useState("");
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [customer, setCustomer] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Picker sources. Capped at 200: these are <select> lists, and a longer one
  // is unusable anyway — the per-module pages carry the searchable tables.
  const warehouses = useQuery<Paginated<Warehouse>>("/inventory/warehouses/", {
    page_size: 100,
  });
  const categories = useQuery<Paginated<Category>>("/catalog/categories/", {
    page_size: 200,
  });
  const products = useQuery<Paginated<MedicineListItem>>("/catalog/medicines/", {
    page_size: 200,
  });
  const customers = useQuery<Paginated<CustomerListItem>>(
    "/partners/customers/",
    { page_size: 200 },
  );
  const salespeople = useQuery<Paginated<User>>("/auth/users/", {
    page_size: 200,
  });

  const reports: ReportDefinition[] = [
    {
      key: "valuation",
      path: "/reporting/inventory/valuation/",
      title: t.reports.inventoryValuation,
      description: t.inventory.stockValue,
      permission: "reporting.view_inventory_reports",
      accepts: ["warehouse", "category"],
    },
    {
      key: "expiry",
      path: "/reporting/inventory/expiry/",
      title: t.reports.expiryReport,
      description: t.reports.valueAtRisk,
      permission: "reporting.view_inventory_reports",
      accepts: ["warehouse"],
    },
    {
      key: "movements",
      path: "/reporting/inventory/movements/",
      title: t.reports.stockMovements,
      description: t.nav.movements,
      permission: "reporting.view_inventory_reports",
      accepts: ["date", "warehouse", "product"],
    },
    {
      key: "dead-stock",
      path: "/reporting/inventory/dead-stock/",
      title: t.reports.deadStock,
      description: t.inventory.stockValue,
      permission: "reporting.view_inventory_reports",
      accepts: ["warehouse"],
    },
    {
      key: "sales",
      path: "/reporting/sales/",
      title: t.reports.salesReport,
      description: t.nav.sales,
      permission: "reporting.view_sales_reports",
      accepts: ["date", "customer", "salesperson"],
    },
    {
      key: "ageing",
      path: "/reporting/financial/receivables-ageing/",
      title: t.reports.receivablesAgeing,
      description: t.partners.outstandingBalance,
      permission: "reporting.view_financial_reports",
      accepts: [],
    },
    {
      key: "profit-loss",
      path: "/reporting/financial/profit-loss/",
      title: t.reports.profitLoss,
      description: t.reports.grossTradingResultNote,
      permission: "reporting.view_financial_reports",
      accepts: ["date"],
    },
    {
      key: "compliance",
      path: "/reporting/compliance/",
      title: t.reports.complianceReport,
      description: t.nav.auditLog,
      permission: "reporting.view_compliance_reports",
      accepts: ["date"],
    },
  ];

  const visible = reports.filter((report) => can(report.permission));

  /** Build the query string for one report from the shared filter state. */
  const paramsFor = (report: ReportDefinition): Record<string, string> => {
    const accepts = (key: FilterKey) => report.accepts.includes(key);
    const params: Record<string, string> = {};

    if (accepts("date")) {
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    if (accepts("warehouse") && warehouse) params.warehouse = warehouse;
    if (accepts("category") && category) params.category = category;
    if (accepts("product") && product) params.product = product;
    if (accepts("customer") && customer) params.customer = customer;
    if (accepts("salesperson") && salesperson) params.salesperson = salesperson;

    return params;
  };

  const download = async (
    report: ReportDefinition,
    format: "csv" | "xlsx" | "pdf",
  ) => {
    setBusy(`${report.key}-${format}`);
    setError(null);
    try {
      // The parameter is `export`, not `format`: DRF reserves `format` for
      // content negotiation and would intercept it before the view runs.
      const blob = await api.download(report.path, {
        export: format,
        ...paramsFor(report),
      });
      saveBlob(blob, `${report.key}-${dateTo}.${format}`);
      toast.success(t.toasts.reportDownloaded, report.title);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : t.common.errorOccurred,
      );
    } finally {
      setBusy(null);
    }
  };

  /** Which filters, in words, a card actually applies. */
  const appliedLabels = (report: ReportDefinition): string[] => {
    const labels: Record<FilterKey, string> = {
      date: t.reports.dateRangeTitle,
      warehouse: t.inventory.warehouse,
      category: t.catalog.category,
      product: t.catalog.name,
      customer: t.sales.customer,
      salesperson: t.reports.salesperson,
    };
    return report.accepts.map((key) => labels[key]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.nav.reports}</h1>
        <p className="text-sm text-muted-foreground">
          {t.reports.generateReport}
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t.reports.filtersTitle}</CardTitle>
          {/* Reports accept different filters; each card lists the ones it
              honours, so a set-but-ignored filter is never a silent surprise. */}
          <CardDescription>{t.reports.filtersHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.reports.dateFrom}>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field label={t.reports.dateTo}>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>

          <Field label={t.inventory.warehouse}>
            <Select
              value={warehouse}
              onChange={(event) => setWarehouse(event.target.value)}
            >
              <option value="">{t.reports.allWarehouses}</option>
              {warehouses.data?.results.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.catalog.category}>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">{t.reports.allCategories}</option>
              {categories.data?.results.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.catalog.name}>
            <Select
              value={product}
              onChange={(event) => setProduct(event.target.value)}
            >
              <option value="">{t.reports.allProducts}</option>
              {products.data?.results.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.product_code} - {row.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.sales.customer}>
            <Select
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
            >
              <option value="">{t.reports.allCustomers}</option>
              {customers.data?.results.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.business_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.reports.salesperson}>
            <Select
              value={salesperson}
              onChange={(event) => setSalesperson(event.target.value)}
            >
              <option value="">{t.reports.allSalespeople}</option>
              {salespeople.data?.results.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name || row.email}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((report) => {
          const applied = appliedLabels(report);
          return (
            <Card key={report.key} className="flex flex-col">
              {/* flex-1 on the header — not mt-auto on the footer — is what
                  actually pushes the buttons to a common baseline when the
                  descriptions differ in length. */}
              <CardHeader className="flex-1">
                <CardTitle>{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
                {applied.length > 0 && (
                  <p className="pt-1 text-xs font-medium text-muted-foreground">
                    {applied.join(" · ")}
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy === `${report.key}-csv`}
                  onClick={() => void download(report, "csv")}
                >
                  <FileText className="h-4 w-4" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy === `${report.key}-xlsx`}
                  onClick={() => void download(report, "xlsx")}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy === `${report.key}-pdf`}
                  onClick={() => void download(report, "pdf")}
                >
                  <FileDown className="h-4 w-4" />
                  PDF
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visible.length === 0 && <Alert>{t.errors.permission_denied}</Alert>}
    </div>
  );
}
