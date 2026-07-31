"use client";

import { ArrowLeft, BadgeCheck, Pencil } from "lucide-react";
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
  Skeleton,
  Textarea,
  statusVariant,
} from "@/components/ui/primitives";
import {
  DetailCardSkeleton,
  DetailPageSkeleton,
} from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { Supplier } from "@/lib/api/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface SupplierPerformance {
  total_orders: number;
  received_orders: number;
  on_time_deliveries: number;
  late_deliveries: number;
  on_time_rate: string;
  average_delay_days: string;
  total_purchase_value: string;
  currency: string;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

export default function SupplierDetailPage() {
  const t = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const supplier = useQuery<Supplier>(`/partners/suppliers/${params.id}/`);
  // Performance is a separate call so a slow aggregate never blocks the
  // identity panel the user came here to read.
  const performance = useQuery<SupplierPerformance>(
    `/partners/suppliers/${params.id}/performance/`,
  );

  const [approveOpen, setApproveOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const approve = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/partners/suppliers/${params.id}/approve/`, {
        notes: notes.trim(),
      });
      setApproveOpen(false);
      toast.success(t.toasts.supplierApproved);
      supplier.refetch();
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

  if (supplier.loading) {
    // Identification, contact, terms, banking — then the full-width
    // performance card underneath them.
    return (
      <DetailPageSkeleton cards={[4, 6, 3, 3]} badges={2} actions={2}>
        <DetailCardSkeleton rows={7} />
      </DetailPageSkeleton>
    );
  }

  if (supplier.error || !supplier.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(supplier.error, t)}
      </Alert>
    );
  }

  const item = supplier.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 text-muted-foreground"
            onClick={() => router.push("/partners/suppliers")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t.nav.suppliers}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{item.name}</h1>
            <Badge variant={statusVariant(item.status)}>
              {t.status[item.status as keyof typeof t.status] ?? item.status}
            </Badge>
            <Badge variant={item.is_approved ? "success" : "secondary"}>
              {item.is_approved ? t.partners.approved : t.partners.notApproved}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {item.supplier_code}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {can("partners.change_supplier") && (
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/partners/suppliers/${params.id}/edit`)
              }
            >
              <Pencil className="h-4 w-4" />
              {t.common.edit}
            </Button>
          )}
          {can("partners.change_supplier") && !item.is_approved && (
            <Button
              onClick={() => {
                setNotes("");
                setError(null);
                setApproveOpen(true);
              }}
            >
              <BadgeCheck className="h-4 w-4" />
              {t.partners.approveSupplier}
            </Button>
          )}
        </div>
      </div>

      {!item.is_approved && (
        <Alert variant="warning">{t.partners.approvalRequiredHint}</Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.identification}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label={t.partners.nif} value={item.nif} />
            <DetailRow label={t.common.status} value={
              t.status[item.status as keyof typeof t.status] ?? item.status
            } />
            <DetailRow label={t.common.notes} value={item.notes} />
            {item.approval_notes && (
              <DetailRow
                label={t.partners.approvalNotes}
                value={item.approval_notes}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.contactDetails}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label={t.partners.contactPerson}
              value={item.contact_person}
            />
            <DetailRow label={t.partners.email} value={item.email} />
            <DetailRow label={t.partners.phone} value={item.phone} />
            <DetailRow label={t.partners.address} value={item.address} />
            <DetailRow label={t.partners.city} value={item.city} />
            <DetailRow label={t.partners.country} value={item.country} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.commercialTerms}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label={t.invoicing.paymentTerms}
              value={`${item.payment_term_days} j`}
            />
            <DetailRow label={t.partners.currency} value={item.currency} />
            <DetailRow
              label={t.partners.leadTimeDays}
              value={item.lead_time_days}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.bankingDetails}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label={t.partners.bankName} value={item.bank_name} />
            <DetailRow
              label={t.partners.bankAccount}
              value={item.bank_account}
            />
            <DetailRow label={t.partners.swiftCode} value={item.swift_code} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.partners.performance}</CardTitle>
          </CardHeader>
          <CardContent>
            {performance.loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="flex justify-between gap-4 py-2.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                ))}
              </div>
            ) : performance.data ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow
                  label={t.partners.totalOrders}
                  value={performance.data.total_orders}
                />
                <DetailRow
                  label={t.partners.receivedOrders}
                  value={performance.data.received_orders}
                />
                <DetailRow
                  label={t.partners.onTimeDeliveries}
                  value={performance.data.on_time_deliveries}
                />
                <DetailRow
                  label={t.partners.lateDeliveries}
                  value={performance.data.late_deliveries}
                />
                <DetailRow
                  label={t.partners.onTimeRate}
                  value={formatPercent(performance.data.on_time_rate)}
                />
                <DetailRow
                  label={t.partners.averageDelay}
                  value={performance.data.average_delay_days}
                />
                <DetailRow
                  label={t.partners.totalPurchaseValue}
                  value={formatMoney(performance.data.total_purchase_value)}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t.common.noResults}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.partners.approveSupplier}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}
            <Alert>{t.partners.approvalRequiredHint}</Alert>
            <Field label={t.partners.approvalNotes}>
              <Textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={approve} loading={saving}>
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
