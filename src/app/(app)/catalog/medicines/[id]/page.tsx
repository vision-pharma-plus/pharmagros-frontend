"use client";

import { ArrowLeft, Snowflake, Lock, Pencil } from "lucide-react";
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
  Skeleton,
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
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { Medicine, PriceHistoryEntry, StockBatch } from "@/lib/api/types";
import {
  formatDate,
  formatDays,
  formatMoney,
  formatQuantity,
  priceExclVat,
} from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useLocale, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface StockResponse {
  product_code: string;
  name: string;
  total_on_hand: string;
  total_available: string;
  reorder_level: string;
  batches: {
    id: string;
    batch_number: string;
    warehouse: string;
    expiry_date: string;
    days_to_expiry: number;
    quantity_remaining: string;
    quantity_available: string;
    status: string;
    is_expired: boolean;
  }[];
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

export default function MedicineDetailPage() {
  const t = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const medicine = useQuery<Medicine>(`/catalog/medicines/${params.id}/`);
  const stock = useQuery<StockResponse>(`/catalog/medicines/${params.id}/stock/`);
  const history = useQuery<Paginated<PriceHistoryEntry>>(
    `/catalog/medicines/${params.id}/price-history/`,
  );

  const [priceOpen, setPriceOpen] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [newCost, setNewCost] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Echo the derived net figure back while the user types, so a price entered
  // here is visibly understood as VAT-inclusive. Exempt products have no VAT
  // to strip, so the readout simply matches what was typed.
  const priceVatRate = medicine.data?.is_vat_exempt
    ? "0"
    : (medicine.data?.vat_rate ?? "0");
  const newPriceNet = newPrice ? priceExclVat(newPrice, priceVatRate) : "";

  const openPriceDialog = () => {
    if (!medicine.data) return;
    setNewPrice(medicine.data.selling_price);
    setNewCost(medicine.data.unit_cost);
    setReason("");
    setError(null);
    setPriceOpen(true);
  };

  const submitPrice = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/catalog/medicines/${params.id}/change-price/`, {
        selling_price: newPrice,
        unit_cost: newCost,
        reason: reason.trim(),
      });
      setPriceOpen(false);
      toast.success(t.toasts.priceChanged, formatMoney(newPrice));
      medicine.refetch();
      history.refetch();
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

  if (medicine.loading) {
    // Identification, pricing and inventory across three columns, then the
    // price-history table that always renders below them.
    return (
      <DetailPageSkeleton
        columns={3}
        cards={[7, 6, 3]}
        badges={2}
        actions={2}
      >
        <TableCardSkeleton columns={5} rows={4} />
      </DetailPageSkeleton>
    );
  }

  if (medicine.error || !medicine.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(medicine.error, t)}
      </Alert>
    );
  }

  const item = medicine.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/catalog/medicines")}
            aria-label={t.common.back}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{item.name}</h1>
              {item.is_controlled && (
                <Badge variant="destructive">
                  <Lock className="mr-1 h-3 w-3" />
                  {t.catalog.isControlled}
                </Badge>
              )}
              {item.requires_cold_chain && (
                <Badge variant="warning">
                  <Snowflake className="mr-1 h-3 w-3" />
                  {t.catalog.coldChain}
                </Badge>
              )}
              <Badge variant={statusVariant(item.status)}>
                {t.status[item.status as keyof typeof t.status] ?? item.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {item.product_code}
              {item.generic_name ? ` · ${item.generic_name}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {can("catalog.change_medicine") && (
            <Button
              variant="outline"
              onClick={() => router.push(`/catalog/medicines/${item.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              {t.common.edit}
            </Button>
          )}
          {can("catalog.change_price") && (
            <Button onClick={openPriceDialog}>{t.catalog.changePrice}</Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.identification}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label={t.catalog.strength} value={item.strength} />
            <DetailRow
              label={t.catalog.dosageForm}
              // The API returns the raw enum; show the translated label.
              value={
                t.dosageForms[item.dosage_form as keyof typeof t.dosageForms] ??
                item.dosage_form
              }
            />
            <DetailRow label={t.catalog.packSize} value={item.pack_size} />
            <DetailRow label={t.catalog.category} value={item.category_name} />
            <DetailRow
              label={t.catalog.manufacturer}
              value={item.manufacturer_name}
            />
            <DetailRow label={t.catalog.barcode} value={item.barcode} />
            <DetailRow
              label={t.catalog.registrationNumber}
              value={item.registration_number}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.pricingAndTax}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow
              label={t.catalog.unitCost}
              value={formatMoney(item.unit_cost)}
            />
            <DetailRow
              label={t.catalog.sellingPrice}
              value={formatMoney(item.selling_price)}
            />
            <DetailRow
              label={t.catalog.wholesalePrice}
              value={formatMoney(item.wholesale_price)}
            />
            <DetailRow
              label={t.catalog.vatRate}
              value={
                item.is_vat_exempt
                  ? t.catalog.vatExempt
                  : `${Number(item.vat_rate).toFixed(2)} %`
              }
            />
            <DetailRow
              label={t.catalog.reorderLevel}
              value={formatQuantity(item.reorder_level)}
            />
            <DetailRow
              label={t.catalog.storageCondition}
              value={
                t.storageConditions[
                  item.storage_condition as keyof typeof t.storageConditions
                ] ?? item.storage_condition
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.nav.inventory}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {stock.loading ? (
              // The three DetailRows this card resolves to.
              <>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex justify-between gap-4 py-2.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                ))}
              </>
            ) : stock.data ? (
              <>
                <DetailRow
                  label={t.inventory.quantityRemaining}
                  value={formatQuantity(stock.data.total_on_hand)}
                />
                <DetailRow
                  label={t.inventory.quantityAvailable}
                  value={formatQuantity(stock.data.total_available)}
                />
                <DetailRow
                  label={t.nav.batches}
                  value={String(stock.data.batches.length)}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {stock.data && stock.data.batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.nav.batches}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t.inventory.batchNumber}</TH>
                  <TH>{t.inventory.warehouse}</TH>
                  <TH>{t.inventory.expiryDate}</TH>
                  <TH numeric>{t.inventory.quantityAvailable}</TH>
                  <TH>{t.common.status}</TH>
                </TR>
              </THead>
              <TBody>
                {stock.data.batches.map((batch) => (
                  <TR key={batch.id}>
                    <TD>
                      <span className="font-mono text-xs">
                        {batch.batch_number}
                      </span>
                    </TD>
                    <TD>{batch.warehouse}</TD>
                    <TD>
                      <span className="tabular-nums">
                        {formatDate(batch.expiry_date)}
                      </span>
                      {!batch.is_expired && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {formatDays(batch.days_to_expiry, locale)}
                        </span>
                      )}
                    </TD>
                    <TD numeric>
                      {formatQuantity(batch.quantity_available)}
                    </TD>
                    <TD>
                      <Badge variant={statusVariant(batch.status)}>
                        {t.status[batch.status as keyof typeof t.status] ??
                          batch.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.catalog.priceHistory}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {history.loading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t.common.date}</TH>
                  <TH numeric>{t.catalog.unitCost}</TH>
                  <TH numeric>{t.catalog.sellingPrice}</TH>
                  <TH>{t.common.reason}</TH>
                  <TH>{t.inventory.performedBy}</TH>
                </TR>
              </THead>
              <TBody>
                {(history.data?.results ?? []).map((entry) => (
                  <TR key={entry.id}>
                    <TD>
                      <span className="tabular-nums">
                        {formatDate(entry.effective_from)}
                      </span>
                    </TD>
                    <TD numeric>
                      <span className="text-muted-foreground">
                        {formatMoney(entry.old_unit_cost)}
                      </span>
                      {" → "}
                      {formatMoney(entry.new_unit_cost)}
                    </TD>
                    <TD numeric>
                      <span className="text-muted-foreground">
                        {formatMoney(entry.old_selling_price)}
                      </span>
                      {" → "}
                      {formatMoney(entry.new_selling_price)}
                    </TD>
                    <TD>{entry.reason}</TD>
                    <TD>{entry.changed_by_name}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.catalog.changePrice}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive">{translateError(error, t)}</Alert>
            )}
            {/* This dialog is a price-entry point in its own right, so it
                repeats the basis rather than relying on the user having seen
                it on the create form. */}
            <Alert>{t.catalog.priceInclVatHint}</Alert>
            <Field
              label={`${t.catalog.unitCost} (BIF)`}
              hint={t.catalog.unitCostExclVatHint}
            >
              <Input
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={newCost}
                onChange={(event) => setNewCost(event.target.value)}
              />
            </Field>
            <Field
              label={`${t.catalog.sellingPrice} (BIF)`}
              hint={
                newPriceNet
                  ? `${t.catalog.priceExclVat}: ${formatMoney(newPriceNet, { decimals: 2 })}`
                  : undefined
              }
            >
              <Input
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={newPrice}
                onChange={(event) => setNewPrice(event.target.value)}
              />
            </Field>
            {/* The reason is mandatory server-side: an unexplained margin
                change is exactly what an audit looks for. */}
            <Field label={t.catalog.priceChangeReason} required>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={reason.trim().length === 0}
              loading={saving}
              onClick={() => void submitPrice()}
            >
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
