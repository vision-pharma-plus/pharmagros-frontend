"use client";

import { ArrowLeft, Download, FileMinus, Send } from "lucide-react";
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
  Input,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  fiscalVariant,
  statusVariant,
} from "@/components/ui/primitives";
import {
  PageHeaderSkeleton,
  StatTilesSkeleton,
  TableCardSkeleton,
} from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api, saveBlob } from "@/lib/api/client";
import type { Invoice } from "@/lib/api/types";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

import { CreditNoteDialog } from "./credit-note-dialog";

export default function InvoiceDetailPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const invoice = useQuery<Invoice>(`/invoicing/invoices/${params.id}/`);

  const [downloading, setDownloading] = useState(false);
  const [declaring, setDeclaring] = useState(false);
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
      toast.success(t.toasts.paymentRecorded, formatMoney(amount));
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
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(invoice.error, t)}
      </Alert>
    );
  }

  const item = invoice.data;
  const hasBalance = Number(item.balance_due) > 0;

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
          {can("invoicing.print_invoice") && (
            <Button
              variant="outline"
              loading={downloading}
              onClick={() => void downloadPdf()}
            >
              <Download className="h-4 w-4" />
              {t.invoicing.downloadPdf}
            </Button>
          )}
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
              {formatMoney(item.total_amount)}
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
              {formatMoney(item.balance_due)}
            </p>
            {/* Red vs green was the only cue that an invoice was settled. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasBalance ? t.invoicing.outstanding : t.status.PAID}
            </p>
          </CardContent>
        </Card>
      </div>

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
                    {formatQuantity(line.quantity, line.unit_of_measure)}
                  </TD>
                  <TD numeric>{formatMoney(line.unit_price)}</TD>
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
                      {formatMoney(line.line_total)}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="ml-auto mt-4 max-w-sm space-y-2 px-6 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.common.subtotal}</span>
              <span className="tabular-nums">{formatMoney(item.subtotal)}</span>
            </div>
            {Number(item.discount_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sales.discount}</span>
                <span className="tabular-nums">
                  − {formatMoney(item.discount_amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.sales.tax}</span>
              <span className="tabular-nums">{formatMoney(item.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>{t.common.total}</span>
              <span className="tabular-nums">
                {formatMoney(item.total_amount)}
              </span>
            </div>
            {Number(item.paid_amount) > 0 && (
              <div className="flex justify-between text-success">
                <span>{t.invoicing.paidAmount}</span>
                <span className="tabular-nums">
                  − {formatMoney(item.paid_amount)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                    <TD numeric>− {formatMoney(note.total_amount)}</TD>
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
