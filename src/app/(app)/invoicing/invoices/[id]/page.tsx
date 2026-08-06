"use client";

import { ArrowLeft, Download, FileMinus, Printer, Send } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
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
  fiscalVariant,
  Input,
  PageError,
  Select,
  statusVariant,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from "@/components/ui/primitives";
import {
  PageHeaderSkeleton,
  StatTilesSkeleton,
  TableCardSkeleton,
} from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api, printBlob, saveBlob } from "@/lib/api/client";
import type { Invoice } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

import { CreditNoteDialog } from "./credit-note-dialog";

export default function InvoiceDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const invoice = useQuery<Invoice>(`/invoicing/invoices/${params.id}/`);

  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState<"download" | "print" | null>(
    null,
  );
  const [payOpen, setPayOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [bankReference, setBankReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const downloadPdf = async () => {
    if (!invoice.data) return;
    setDownloading(true);
    try {
      const blob = await api.download(
        `/invoicing/invoices/${params.id}/pdf/`,
        { language: locale },
      );
      saveBlob(blob, `${invoice.data.invoice_number}.pdf`);
      // Refetch so the incremented print count is reflected — a reprint is a
      // recorded event, and the UI should show that it happened.
      invoice.refetch();
    } catch (caught) {
      // A failed download used to stop the spinner and say nothing, which is
      // indistinguishable from a browser that silently blocked the file.
      toast.error(
        t.toasts.pdfFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setDownloading(false);
    }
  };

  const printPdf = async () => {
    if (!invoice.data) return;
    setPrinting(true);
    try {
      const blob = await api.download(
        `/invoicing/invoices/${params.id}/pdf/`,
        { language: locale },
      );
      printBlob(blob);
      toast.success(t.toasts.invoiceSentToPrinter, invoice.data.invoice_number);
      // Same reason as the download: the server counts this copy, so refetch
      // to show the reprint that just happened.
      invoice.refetch();
    } catch (caught) {
      toast.error(
        t.toasts.printFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setPrinting(false);
    }
  };

  /**
   * Hand the customer their receipt, on screen or on paper.
   *
   * The receipt is a separate document from the invoice with its own print
   * counter, so these hit the receipt endpoint rather than reusing the invoice
   * one — printing an invoice is not evidence that a receipt was issued.
   */
  const receiptAction = async (action: "download" | "print") => {
    const receipt = invoice.data?.payment_receipt_id;
    const number = invoice.data?.payment_receipt_number ?? "";
    if (!receipt) return;

    setReceiptBusy(action);
    try {
      const blob = await api.download(`/invoicing/receipts/${receipt}/pdf/`, {
        language: locale,
      });
      if (action === "print") {
        printBlob(blob);
        toast.success(t.toasts.invoiceSentToPrinter, number);
      } else {
        saveBlob(blob, `${number}.pdf`);
      }
    } catch (caught) {
      toast.error(
        t.toasts.pdfFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setReceiptBusy(null);
    }
  };

  const declareToObr = async () => {
    setDeclaring(true);
    try {
      await api.post(`/invoicing/invoices/${params.id}/declare/`);
      toast.success(t.toasts.invoiceDeclared, invoice.data?.invoice_number);
      invoice.refetch();
    } catch (caught) {
      // The OBR's own reason comes back in the error envelope, and it is the
      // only thing that tells the operator what to fix.
      toast.error(
        t.toasts.invoiceDeclareFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setDeclaring(false);
    }
  };

  const recordPayment = async () => {
    if (!invoice.data) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/invoicing/payments/", {
        customer: invoice.data.customer,
        amount,
        method,
        bank_reference: bankReference,
        notes,
        invoice_ids: [invoice.data.id],
      });
      setPayOpen(false);
      toast.success(t.toasts.paymentRecorded, fmt.money(amount));
      invoice.refetch();
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

  if (invoice.loading) {
    // Four summary tiles (dates, total, balance) above the line items.
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton back badges={2} actions={3} />
        <StatTilesSkeleton count={4} />
        <TableCardSkeleton columns={7} rows={5} />
      </div>
    );
  }

  if (invoice.error || !invoice.data) {
    return (
      <PageError
        error={invoice.error}
        message={translateError(invoice.error, t)}
        onRetry={invoice.refetch}
        title={t.common.errorOccurred}
        retryLabel={t.common.retry}
        deniedTitle={t.common.accessDeniedTitle}
        deniedBody={t.common.accessDeniedBody}
        notFoundMessage={t.errors.not_found}
      />
    );
  }

  const item = invoice.data;
  const hasBalance = Number(item.balance_due) > 0;

  // Clamped because an over-allocation, or a rounding drift between the paid
  // total and the invoice total, must not paint a bar past its track.
  const progressPercent = Math.min(
    100,
    Math.max(0, Number(item.payment_progress) || 0),
  );
  const allocations = item.payment_allocations ?? [];
  const showProgress = Number(item.paid_amount) > 0 && hasBalance;

  /** Governs both the download and the print: one PDF, one permission. */
  const canPrintInvoice = can("invoicing.print_invoice");

  // A credit note corrects a document that has already been issued, so a
  // draft has nothing to correct (edit it instead) and a cancelled invoice no
  // longer stands. Crediting a credit note is not a thing either — the server
  // refuses it, and the button should not invite the attempt.
  const canIssueCreditNote =
    can("invoicing.issue_credit_note") &&
    !item.is_editable &&
    item.status !== "CANCELLED" &&
    item.invoice_type !== "CREDIT_NOTE";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="no-print"
            onClick={() => router.push("/invoicing/invoices")}
            aria-label={t.common.back}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{item.invoice_number}</h1>
              <Badge variant={statusVariant(item.status)}>
                {t.status[item.status as keyof typeof t.status] ?? item.status}
              </Badge>
              {item.is_overdue && (
                <Badge variant="destructive">
                  {item.days_overdue} {t.invoicing.daysOverdue}
                </Badge>
              )}
              {/* Shown only when the document is actually in scope for
                  declaration; a NOT_REQUIRED badge on every proforma would
                  be noise. */}
              {item.fiscal_status !== "NOT_REQUIRED" && (
                <Badge variant={fiscalVariant(item.fiscal_status)}>
                  {t.invoicing.fiscal[item.fiscal_status]}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.customer_name}
              {item.customer_nif ? ` · NIF ${item.customer_nif}` : ""}
            </p>
          </div>
        </div>

        <div className="no-print flex flex-wrap gap-2">
          {/* Both actions serve the same PDF under the same permission, so
              they stand or fall together — disabled with the reason on hover
              rather than hidden, so a missing permission does not read as a
              missing feature. */}
          <Button
            variant="outline"
            disabled={!canPrintInvoice}
            loading={downloading}
            title={
              canPrintInvoice ? undefined : t.permissions.printInvoiceNotAllowed
            }
            onClick={() => void downloadPdf()}
          >
            <Download className="h-4 w-4" />
            {t.invoicing.downloadPdf}
          </Button>
          <Button
            variant="outline"
            disabled={!canPrintInvoice}
            loading={printing}
            title={
              canPrintInvoice ? undefined : t.permissions.printInvoiceNotAllowed
            }
            onClick={() => void printPdf()}
          >
            <Printer className="h-4 w-4" />
            {t.common.print}
          </Button>
          {/* Only offered once automatic retries have given up. While the
              invoice is merely queued, the sweep will handle it and a manual
              button would invite pointless clicking. */}
          {can("invoicing.declare_invoice") &&
            item.fiscal_status === "REJECTED" && (
              <Button
                variant="outline"
                loading={declaring}
                onClick={() => void declareToObr()}
              >
                <Send className="h-4 w-4" />
                {t.invoicing.declareToObr}
              </Button>
            )}
          {canIssueCreditNote && (
            <Button variant="outline" onClick={() => setCreditOpen(true)}>
              <FileMinus className="h-4 w-4" />
              {t.invoicing.issueCreditNote}
            </Button>
          )}
          {can("invoicing.record_payment") && hasBalance && (
            <Button
              onClick={() => {
                setAmount(item.balance_due);
                setError(null);
                setPayOpen(true);
              }}
            >
              {t.invoicing.recordPayment}
            </Button>
          )}
        </div>
      </div>

      {/* Raised automatically when the balance reached zero. Surfaced here
          because this is the page someone is on when the customer asks for
          proof of payment — sending them to a separate receipts list to find
          the document for the invoice already on screen is busywork. */}
      {item.payment_receipt_id && (
        <Alert
          variant={item.payment_receipt_number ? "success" : "default"}
          title={`${t.invoicing.paymentReceipt} ${item.payment_receipt_number ?? ""}`}
          className="no-print"
        >
          <p className="mb-3">{t.invoicing.paymentReceiptIssued}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={receiptBusy === "download"}
              onClick={() => void receiptAction("download")}
            >
              <Download className="h-4 w-4" />
              {t.invoicing.downloadReceipt}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={receiptBusy === "print"}
              onClick={() => void receiptAction("print")}
            >
              <Printer className="h-4 w-4" />
              {t.invoicing.printReceipt}
            </Button>
          </div>
        </Alert>
      )}

      {/* On a credit note, the invoice it corrects is the first thing anyone
          opening it needs, so it is a link rather than a bare number. */}
      {item.original_invoice && (
        <Alert>
          {t.invoicing.correctsInvoice}{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() =>
              router.push(`/invoicing/invoices/${item.original_invoice}`)
            }
          >
            {item.original_invoice_number}
          </button>
          {item.credit_reason_code
            ? ` · ${t.invoicing.creditReasons[item.credit_reason_code]}`
            : ""}
        </Alert>
      )}

      {!item.is_editable && (
        <Alert variant="warning">{t.invoicing.postedWarning}</Alert>
      )}

      {/* A rejection is the one fiscal state that needs a human, so it is
          raised to an alert with the OBR's own reason attached. */}
      {item.fiscal_status === "REJECTED" && (
        <Alert variant="destructive" title={t.invoicing.fiscal.REJECTED}>
          <p>{t.invoicing.fiscalRejectedNote}</p>
          {item.last_declaration_error && (
            <p className="mt-2 font-mono text-xs break-words">
              {item.last_declaration_error}
            </p>
          )}
        </Alert>
      )}

      {item.fiscal_status !== "NOT_REQUIRED" && (
        <Card>
          <CardHeader>
            <CardTitle>{t.invoicing.fiscalStatus}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0 text-sm">
            <p className="text-muted-foreground">
              {item.fiscal_status === "PENDING" && t.invoicing.fiscalPendingNote}
              {item.fiscal_status === "DECLARED" && t.invoicing.fiscalDeclaredNote}
            </p>

            {/* The signature exists from the moment of posting; the OBR's own
                identifiers only after it has accepted the document. */}
            {item.fiscal_signature && (
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t.invoicing.fiscalSignature}
                </p>
                <p className="font-mono text-xs break-all">
                  {item.fiscal_signature}
                </p>
              </div>
            )}
            {item.obr_registered_number && (
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t.invoicing.obrRegisteredNumber}
                </p>
                <p className="font-mono text-xs break-all">
                  {item.obr_registered_number}
                </p>
              </div>
            )}
            {item.declared_at && (
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t.invoicing.declaredAt}
                </p>
                <p className="tabular-nums">{formatDate(item.declared_at)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">
              {t.invoicing.invoiceDate}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatDate(item.invoice_date)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">
              {t.invoicing.dueDate}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatDate(item.due_date)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">
              {t.invoicing.totalAmount}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {fmt.money(item.total_amount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">
              {t.invoicing.balanceDue}
            </p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                hasBalance ? "text-destructive" : "text-success"
              }`}
            >
              {fmt.money(item.balance_due)}
            </p>
            {/* Red vs green was the only cue that an invoice was settled, and
                it could not distinguish money received from a debt cancelled
                by a credit note — both leave a zero balance. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasBalance
                ? t.invoicing.outstanding
                : item.settled_by_credit_note
                  ? t.invoicing.settledByCreditNote
                  : t.status.PAID}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment progress. Shown only once something has been applied and
          while money is still owed: at 0% the balance tile already says it,
          and at 100% the bar is a full green rectangle restating the tile
          beside it. The partial case is the one no other element conveys —
          a 60%-settled invoice and a 5%-settled one look identical otherwise. */}
      {showProgress && (
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {t.invoicing.paymentProgress}
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {fmt.money(item.paid_amount)} / {fmt.money(item.total_amount)}
                <span className="ml-2 font-medium text-foreground">
                  {progressPercent.toFixed(0)} %
                </span>
              </p>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t.invoicing.paymentProgress}
            >
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.invoicing.remainingToPay}: {fmt.money(item.balance_due)}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.sections.lineItems}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>{t.catalog.name}</TH>
                <TH numeric>{t.common.quantity}</TH>
                <TH numeric>{t.sales.unitPrice}</TH>
                <TH numeric>{t.sales.discount}</TH>
                <TH numeric>{t.sales.tax}</TH>
                <TH numeric>{t.sales.lineTotal}</TH>
              </TR>
            </THead>
            <TBody>
              {item.lines.map((line) => (
                <TR key={line.id}>
                  <TD>{line.line_number}</TD>
                  <TD>
                    <p className="font-medium">{line.description}</p>
                    {/* Batch numbers on the invoice are the customer's own
                        traceability record for a recall. */}
                    {line.batch_numbers && (
                      <p className="text-xs text-muted-foreground">
                        {t.inventory.batchNumber}: {line.batch_numbers}
                        {line.expiry_dates ? ` · ${line.expiry_dates}` : ""}
                      </p>
                    )}
                  </TD>
                  <TD numeric>
                    {fmt.quantity(line.quantity, line.unit_of_measure)}
                  </TD>
                  <TD numeric>{fmt.money(line.unit_price)}</TD>
                  <TD numeric>
                    {Number(line.discount_percent) > 0
                      ? `${Number(line.discount_percent).toFixed(2)} %`
                      : "—"}
                  </TD>
                  <TD numeric>
                    {Number(line.tax_rate) > 0
                      ? `${Number(line.tax_rate).toFixed(2)} %`
                      : t.catalog.vatExempt}
                  </TD>
                  <TD numeric>
                    <span className="font-medium">
                      {fmt.money(line.line_total)}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="ml-auto mt-4 max-w-sm space-y-2 px-6 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.common.subtotal}</span>
              <span className="tabular-nums">{fmt.money(item.subtotal)}</span>
            </div>
            {Number(item.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.discount}</span>
                <span className="tabular-nums">
                  − {fmt.money(item.discount_amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.sales.tax}</span>
              <span className="tabular-nums">{fmt.money(item.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>{t.common.total}</span>
              <span className="tabular-nums">
                {fmt.money(item.total_amount)}
              </span>
            </div>
            {Number(item.paid_amount) > 0 && (
              <div className="flex justify-between text-success">
                <span>{t.invoicing.paidAmount}</span>
                <span className="tabular-nums">
                  − {fmt.money(item.paid_amount)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* What actually settled this invoice.
          `Payment` links to invoices many-to-many through allocations — one
          transfer can clear six invoices, one invoice can take several
          instalments — so a single "amount paid" figure is the output of a
          history that was previously unreachable from here. Answering "which
          payments were applied to this?" meant leaving for the payments list
          and scanning it for this invoice number. */}
      {(allocations.length > 0 || hasBalance) && (
        <Card>
          <CardHeader>
            <CardTitle>{t.invoicing.paymentsApplied}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {allocations.length === 0 ? (
              <p className="px-6 pb-2 text-sm text-muted-foreground">
                {t.invoicing.noPaymentsYet}
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t.common.date}</TH>
                    <TH>{t.invoicing.paymentReference}</TH>
                    <TH>{t.invoicing.paymentMethod}</TH>
                    <TH>{t.invoicing.receivedBy}</TH>
                    <TH numeric>{t.invoicing.amountApplied}</TH>
                  </TR>
                </THead>
                <TBody>
                  {/* Reversing a payment deletes its allocation rows, so a
                      bounced cheque disappears from this table and the balance
                      goes back up together — the evidence of the reversal
                      lives on the payment record itself. Nothing here needs a
                      "reversed" state. */}
                  {allocations.map((allocation) => (
                    <TR key={allocation.id}>
                      <TD>{formatDate(allocation.payment_date)}</TD>
                      <TD>
                        <span className="font-medium">
                          {allocation.payment_reference}
                        </span>
                        {allocation.bank_reference && (
                          <p className="text-xs text-muted-foreground">
                            {allocation.bank_reference}
                          </p>
                        )}
                      </TD>
                      <TD>
                        {/* A credit-note offset is a synthetic payment raised
                            by the correction, not money anyone received, so it
                            is badged rather than named like a tender type. */}
                        {allocation.method === "CREDIT_NOTE" ? (
                          <Badge variant="warning">
                            {t.invoicing.creditNoteOffset}
                          </Badge>
                        ) : (
                          <span>
                            {t.paymentMethods[
                              allocation.method as keyof typeof t.paymentMethods
                            ] ?? allocation.method}
                          </span>
                        )}
                      </TD>
                      <TD className="text-muted-foreground">
                        {allocation.received_by_name || "—"}
                      </TD>
                      <TD numeric>{fmt.money(allocation.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}

            {item.settled_by_credit_note && (
              <p className="px-6 pt-3 text-xs text-muted-foreground">
                {t.invoicing.settledByCreditNoteHint}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Credit notes already raised against this invoice. Shown so the
          balance reads correctly — an invoice settled by a credit rather than
          by cash is otherwise indistinguishable from one that was paid. */}
      {item.corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.invoicing.creditNotesIssued}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t.invoicing.invoiceNumber}</TH>
                  <TH>{t.invoicing.invoiceDate}</TH>
                  <TH>{t.invoicing.creditNoteReason}</TH>
                  <TH numeric>{t.invoicing.totalAmount}</TH>
                </TR>
              </THead>
              <TBody>
                {item.corrections.map((note) => (
                  <TR
                    key={note.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/invoicing/invoices/${note.id}`)}
                  >
                    <TD>
                      <span className="font-medium">{note.invoice_number}</span>
                    </TD>
                    <TD>{formatDate(note.invoice_date)}</TD>
                    <TD>
                      <p>
                        {note.credit_reason_code
                          ? t.invoicing.creditReasons[note.credit_reason_code]
                          : "—"}
                      </p>
                      {note.notes && (
                        <p className="text-xs text-muted-foreground">
                          {note.notes}
                        </p>
                      )}
                    </TD>
                    <TD numeric>− {fmt.money(note.total_amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {item.print_count > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.common.print}: {item.print_count}
        </p>
      )}

      {canIssueCreditNote && (
        <CreditNoteDialog
          invoice={item}
          open={creditOpen}
          onOpenChange={setCreditOpen}
          // The original's balance and status change as the credit is
          // applied, so the page it was issued from has to be refetched.
          onIssued={(creditNoteId) => {
            invoice.refetch();
            router.push(`/invoicing/invoices/${creditNoteId}`);
          }}
        />
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.invoicing.recordPayment}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive">{translateError(error, t)}</Alert>
            )}
            <Field label={`${t.invoicing.totalAmount} (BIF)`} required>
              <Input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t.invoicing.paymentMethod} required>
              <Select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {Object.entries(t.paymentMethods).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.invoicing.bankReference}>
              <Input
                value={bankReference}
                onChange={(event) => setBankReference(event.target.value)}
              />
            </Field>
            <Field label={t.common.notes}>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={!amount || Number(amount) <= 0}
              loading={saving}
              onClick={() => void recordPayment()}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
