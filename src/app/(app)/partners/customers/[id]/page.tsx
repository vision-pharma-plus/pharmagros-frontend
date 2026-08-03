"use client";

import { ArrowLeft, Ban, Pencil, ShieldCheck } from "lucide-react";
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
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  statusVariant,
} from "@/components/ui/primitives";
import {
  DetailPageSkeleton,
  TableCardSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";
import { ApiError, api } from "@/lib/api/client";
import type { Customer, CustomerStatement } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

type DialogMode = "credit-limit" | "block" | "unblock" | null;

export default function CustomerDetailPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const customer = useQuery<Customer>(`/partners/customers/${params.id}/`);
  const statement = useQuery<CustomerStatement>(
    `/partners/customers/${params.id}/statement/`,
  );

  const [mode, setMode] = useState<DialogMode>(null);
  const [limit, setLimit] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const openDialog = (next: DialogMode) => {
    setLimit(customer.data?.credit_limit ?? "");
    setReason("");
    setError(null);
    setMode(next);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (mode === "credit-limit") {
        await api.post(`/partners/customers/${params.id}/credit-limit/`, {
          credit_limit: limit,
          reason: reason.trim(),
        });
      } else if (mode === "block") {
        await api.post(`/partners/customers/${params.id}/block-credit/`, {
          reason: reason.trim(),
        });
      } else if (mode === "unblock") {
        await api.post(`/partners/customers/${params.id}/unblock-credit/`, {
          reason: reason.trim(),
        });
      }
      setMode(null);
      customer.refetch();
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

  if (customer.loading) {
    // Contact, credit and licence across three columns, then the account
    // statement table below.
    return (
      <DetailPageSkeleton columns={3} cards={[6, 5, 4]} badges={2} actions={2}>
        <TableCardSkeleton columns={6} rows={5} />
      </DetailPageSkeleton>
    );
  }

  if (customer.error || !customer.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(customer.error, t)}
      </Alert>
    );
  }

  const item = customer.data;
  // Unblocking does not require a reason server-side, so the submit gate
  // must not demand one — otherwise the button would never enable.
  const reasonRequired = mode === "credit-limit" || mode === "block";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/partners/customers")}
            aria-label={t.common.back}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{item.business_name}</h1>
              <Badge variant={statusVariant(item.status)}>
                {t.status[item.status as keyof typeof t.status] ?? item.status}
              </Badge>
              {item.credit_blocked && (
                <Badge variant="destructive">
                  <Ban className="mr-1 h-3 w-3" />
                  {t.partners.creditBlocked}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.customer_code}
              {item.nif ? ` · NIF ${item.nif}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {can("partners.change_customer") && (
            <Button
              variant="outline"
              onClick={() => router.push(`/partners/customers/${item.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              {t.common.edit}
            </Button>
          )}
          {can("partners.set_credit_limit") && (
            <>
              <Button
                variant="outline"
                onClick={() => openDialog("credit-limit")}
              >
                {t.partners.creditLimit}
              </Button>
              {item.credit_blocked ? (
                <Button variant="outline" onClick={() => openDialog("unblock")}>
                  <ShieldCheck className="h-4 w-4" />
                  {t.partners.unblockCredit}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => openDialog("block")}
                >
                  <Ban className="h-4 w-4" />
                  {t.partners.blockCredit}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {item.licence_is_expired && (
        <Alert variant="destructive" title={t.partners.licenceExpiry}>
          {t.partners.licenceExpiredWarning}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.partners.contactPerson}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label={t.partners.customerType}
              value={item.customer_type}
            />
            <DetailRow
              label={t.partners.contactPerson}
              value={item.contact_person}
            />
            <DetailRow label={t.partners.email} value={item.email} />
            <DetailRow label={t.partners.phone} value={item.phone} />
            <DetailRow label={t.partners.address} value={item.address} />
            <DetailRow label={t.partners.city} value={item.city} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.creditLimit}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label={t.partners.creditLimit}
              value={fmt.money(item.credit_limit)}
            />
            <DetailRow
              label={t.partners.outstandingBalance}
              value={
                <span className={item.is_over_limit ? "text-destructive" : ""}>
                  {fmt.money(item.outstanding_balance)}
                </span>
              }
            />
            <DetailRow
              label={t.partners.availableCredit}
              value={fmt.money(item.available_credit)}
            />
            <DetailRow
              label={t.partners.creditUtilisation}
              value={fmt.percent(item.credit_utilisation)}
            />
            <DetailRow
              label={t.invoicing.paymentTerms}
              value={fmt.days(item.payment_term_days)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.pharmacyLicence}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label={t.partners.pharmacyLicence}
              value={item.pharmacy_licence}
            />
            <DetailRow
              label={t.partners.licenceExpiry}
              value={formatDate(item.licence_expiry)}
            />
            <DetailRow label={t.partners.rcNumber} value={item.rc_number} />
            <DetailRow
              label={t.sales.saleNumber}
              value={formatDate(item.last_sale_at)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.partners.statement}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {statement.loading ? (
            <TableSkeleton columns={6} rows={5} />
          ) : statement.data && statement.data.lines.length > 0 ? (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>{t.common.date}</TH>
                    <TH>{t.common.status}</TH>
                    <TH>{t.invoicing.invoiceNumber}</TH>
                    <TH numeric>{t.invoicing.totalAmount}</TH>
                    <TH numeric>{t.invoicing.paidAmount}</TH>
                    <TH numeric>{t.invoicing.balanceDue}</TH>
                  </TR>
                </THead>
                <TBody>
                  {statement.data.lines.map((line, index) => (
                    <TR key={`${line.reference}-${index}`}>
                      <TD>
                        <span className="tabular-nums">
                          {formatDate(line.date)}
                        </span>
                      </TD>
                      <TD>
                        <Badge
                          variant={
                            line.type === "PAYMENT" ? "success" : "secondary"
                          }
                        >
                          {line.type === "PAYMENT"
                            ? t.nav.payments
                            : t.nav.invoices}
                        </Badge>
                      </TD>
                      <TD>
                        <span className="font-mono text-xs">
                          {line.reference}
                        </span>
                      </TD>
                      <TD numeric>
                        {line.debit && Number(line.debit) > 0
                          ? fmt.money(line.debit)
                          : "—"}
                      </TD>
                      <TD numeric>
                        {line.credit && Number(line.credit) > 0
                          ? fmt.money(line.credit)
                          : "—"}
                      </TD>
                      <TD numeric>
                        <span className="font-medium">
                          {fmt.money(line.balance)}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="flex justify-end gap-6 border-t border-border px-6 pt-4 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {t.invoicing.balanceDue}:{" "}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {fmt.money(statement.data.closing_balance)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t.common.noResults}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "credit-limit"
                ? t.partners.creditLimit
                : mode === "block"
                  ? t.partners.blockCredit
                  : t.partners.unblockCredit}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive">{translateError(error, t)}</Alert>
            )}
            {mode === "credit-limit" && (
              <Field label={`${t.partners.creditLimit} (BIF)`} required>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  autoFocus
                />
              </Field>
            )}
            <Field label={t.common.reason} required={reasonRequired}>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={reasonRequired && reason.trim().length === 0}
              loading={saving}
              onClick={() => void submit()}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
