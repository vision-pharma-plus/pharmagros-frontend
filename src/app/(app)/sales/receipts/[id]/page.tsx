"use client";

import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { TranslatableText } from "@/components/translatable-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
} from "@/components/ui/primitives";
import {
  PageHeaderSkeleton,
  TableCardSkeleton,
} from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api, printBlob, saveBlob } from "@/lib/api/client";
import type { Invoice, SalesReceipt } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

export default function ReceiptDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const receipt = useQuery<SalesReceipt>(`/sales/receipts/${params.id}/`);

  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  /** Governs both the download and the print: one PDF, one permission. */
  const canPrint = can("sales.print_receipt");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const downloadPdf = async () => {
    if (!receipt.data) return;
    setDownloading(true);
    try {
      const blob = await api.download(`/sales/receipts/${params.id}/pdf/`, {
        language: locale,
      });
      saveBlob(blob, `${receipt.data.receipt_number}.pdf`);
      // Refetch so the incremented print count shows: a reprint is a recorded
      // event and the page should reflect that it happened.
      receipt.refetch();
    } catch (caught) {
      toast.error(
        t.toasts.pdfFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setDownloading(false);
    }
  };

  const printPdf = async () => {
    if (!receipt.data) return;
    setPrinting(true);
    try {
      const blob = await api.download(`/sales/receipts/${params.id}/pdf/`, {
        language: locale,
      });
      printBlob(blob);
      toast.success(t.toasts.receiptSentToPrinter, receipt.data.receipt_number);
      // Same reason as the download: the server counts this copy, so refetch
      // to show the reprint that just happened.
      receipt.refetch();
    } catch (caught) {
      toast.error(
        t.toasts.printFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setPrinting(false);
    }
  };

  const issueInvoice = async () => {
    setSaving(true);
    setError(null);
    try {
      const invoice = await api.post<Invoice>(
        `/sales/receipts/${params.id}/invoice/`,
        { reason },
      );
      setInvoiceOpen(false);
      toast.success(t.sales.issueInvoice, invoice.invoice_number);
      // Straight to the new document: the operator raised it in order to hand
      // it over or print it.
      router.push(`/invoicing/invoices/${invoice.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (receipt.loading) {
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton />
        <TableCardSkeleton />
      </div>
    );
  }

  const data = receipt.data;
  if (!data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(receipt.error, t)}
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{data.receipt_number}</h1>
              {data.is_cancelled ? (
                <Badge variant="destructive">{t.common.cancelled}</Badge>
              ) : (
                <Badge variant="success">{t.sales.paidInFull}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.customer_name} · {formatDate(data.issued_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Both actions serve the same PDF under the same permission, so
              they stand or fall together — disabled with the reason on hover
              rather than hidden, so a missing permission does not read as a
              missing feature. */}
          <Button
            variant="outline"
            disabled={!canPrint}
            loading={downloading}
            title={canPrint ? undefined : t.permissions.printReceiptNotAllowed}
            onClick={() => void downloadPdf()}
          >
            <Download className="h-4 w-4" />
            {t.common.download}
          </Button>
          <Button
            variant="outline"
            disabled={!canPrint}
            loading={printing}
            title={canPrint ? undefined : t.permissions.printReceiptNotAllowed}
            onClick={() => void printPdf()}
          >
            <Printer className="h-4 w-4" />
            {t.common.print}
          </Button>
          {/* Offered only when there is no invoice yet: a sale has exactly one,
              and raising a second is what the backend refuses outright. */}
          {can("sales.invoice_receipt") &&
            !data.has_invoice &&
            !data.is_cancelled && (
              <Button onClick={() => setInvoiceOpen(true)}>
                <FileText className="h-4 w-4" />
                {t.sales.issueInvoice}
              </Button>
            )}
        </div>
      </div>

      {data.is_cancelled && (
        <Alert variant="destructive" title={t.common.cancelled}>
          <TranslatableText inline text={data.cancellation_reason} />
        </Alert>
      )}

      {/* An invoice already exists for this sale. Saying so, with a link,
          is what stops an operator hunting for a second "convert" button. */}
      {data.has_invoice && (
        <Alert title={t.sales.invoiceAlreadyIssued}>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => router.push(`/invoicing/invoices/${data.invoice_id}`)}
          >
            {data.invoice_number}
          </button>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.sections.lineItems}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {/* Scrolls inside its own container so the page body never scrolls
                sideways on a counter tablet. */}
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>{t.catalog.name}</TH>
                    <TH className="text-right">{t.common.quantity}</TH>
                    <TH className="text-right">{t.sales.unitPrice}</TH>
                    <TH className="text-right">{t.sales.lineTotal}</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.lines.map((line) => (
                    <TR key={line.id}>
                      <TD>
                        <div className="font-medium">{line.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.product_code}
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {fmt.quantity(line.quantity)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {fmt.money(line.unit_price)}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {fmt.money(line.line_total)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.sales.grandTotal}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.common.subtotal}</span>
                <span className="tabular-nums">{fmt.money(data.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.tax}</span>
                <span className="tabular-nums">{fmt.money(data.tax_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <span>{t.common.total}</span>
                <span className="tabular-nums">
                  {fmt.money(data.total_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.tendered}</span>
                <span className="tabular-nums">
                  {fmt.money(data.amount_tendered)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.changeDue}</span>
                <span className="tabular-nums">
                  {fmt.money(data.change_given)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.sales.payment}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {t.sales.paymentMethod}
                </span>
                <span className="text-right">
                  {t.paymentMethods[
                    data.payment_method as keyof typeof t.paymentMethods
                  ] ?? data.payment_method}
                </span>
              </div>
              {data.payment_reference && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t.sales.paymentReference}
                  </span>
                  <span className="text-right">{data.payment_reference}</span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.sales.saleNumber}</span>
                <button
                  type="button"
                  className="text-right underline underline-offset-2"
                  onClick={() => router.push(`/sales?search=${data.sale_number}`)}
                >
                  {data.sale_number}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.sales.issueInvoiceForReceipt}</DialogTitle>
            {/* States the guarantee plainly: this is a second document, not a
                second charge. It is the question every operator asks here. */}
            <DialogDescription>
              {t.sales.issueInvoiceExplanation}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}
            <Field label={t.sales.issueInvoiceReason}>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                autoFocus
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button loading={saving} onClick={() => void issueInvoice()}>
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
