"use client";

/**
 * Receiving goods — the one screen for "a delivery arrived".
 *
 * The workflow this replaces was spread across three destinations: catalogue
 * the product, raise and approve a purchase order, then find the receive
 * button buried on that order's detail page. A clerk standing over an open box
 * had no way in unless somebody had already raised a PO, so opening stock and
 * emergency deliveries were being forced through the product form, which had
 * no business booking stock at all.
 *
 * Both modes are deliberately the same screen rather than two. The physical
 * task is identical — read the carton, type the lot, count the units — and the
 * only difference is whether a purchase order is there to pre-fill it. Two
 * screens would mean learning the layout twice.
 *
 * Batch fields are never optional here and never collapsed behind a toggle. A
 * lot code and an expiry are what make stock traceable in a recall, and the
 * clerk is holding the carton they are printed on: this is the one moment in
 * the system where that information is genuinely available.
 */

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EntityPicker } from "@/components/entity-picker";
import { ReferenceSelect } from "@/components/reference-select";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { FormCardSkeleton } from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type {
  Medicine,
  MedicineListItem,
  PurchaseOrder,
  PurchaseOrderLine,
  Warehouse,
} from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

type Mode = "order" | "direct";

interface ReceiptLine {
  /** Stable key for React; not sent to the API. */
  key: string;
  /** Set only in order mode — ties the line back to its PO line. */
  poLineId: number | null;
  product: MedicineListItem | null;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate: string;
  quantity: string;
  unitCost: string;
  /** Blank means "use the delivery's warehouse". */
  warehouseOverride: string;
}

let lineCounter = 0;
const newLine = (over: Partial<ReceiptLine> = {}): ReceiptLine => ({
  key: `line-${(lineCounter += 1)}`,
  poLineId: null,
  product: null,
  batchNumber: "",
  expiryDate: "",
  manufacturingDate: "",
  quantity: "",
  unitCost: "",
  warehouseOverride: "",
  ...over,
});

const today = () => new Date().toISOString().slice(0, 10);

export default function ReceiveStockPage() {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const searchParams = useSearchParams();
  const can = useAuth((state) => state.can);

  // Deep links carry intent from elsewhere: `?order=` from a purchase order's
  // receive button, `?product=` from a product that was just catalogued.
  const presetOrderId = searchParams.get("order") ?? "";
  const presetProductId = searchParams.get("product") ?? "";

  const [mode, setMode] = useState<Mode>(presetOrderId ? "order" : "direct");
  const [orderId, setOrderId] = useState(presetOrderId);
  const [warehouseId, setWarehouseId] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [isOpeningBalance, setIsOpeningBalance] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const warehouses = useQuery<Paginated<Warehouse>>(
    "/inventory/warehouses/?is_active=true&page_size=200",
  );
  const receivableOrders = useQuery<Paginated<PurchaseOrder>>(
    "/purchasing/orders/?can_receive=true&page_size=100",
  );
  const order = useQuery<PurchaseOrder>(
    mode === "order" && orderId ? `/purchasing/orders/${orderId}/` : null,
  );

  // Default to the warehouse flagged as default. Defaulting is safe here in a
  // way it is not for a lot code: a warehouse is an internal designation the
  // clerk can see and change on screen, and a wrong one is a correctable
  // transfer rather than an unrecoverable traceability gap.
  useEffect(() => {
    if (warehouseId || !warehouses.data) return;
    const list = warehouses.data.results;
    const fallback = list.find((w) => w.is_default) ?? list[0];
    if (fallback) setWarehouseId(fallback.id);
  }, [warehouses.data, warehouseId]);

  // Pre-select a product arriving from the catalogue form.
  useEffect(() => {
    if (!presetProductId) return;
    let cancelled = false;
    api
      .get<Medicine>(`/catalog/medicines/${presetProductId}/`)
      .then((product) => {
        if (cancelled) return;
        setLines((current) => {
          const [first, ...rest] = current;
          if (!first || first.product) return current;
          return [
            { ...first, product, unitCost: product.unit_cost ?? "" },
            ...rest,
          ];
        });
      })
      .catch(() => {
        /* A stale link should not block receiving; the picker still works. */
      });
    return () => {
      cancelled = true;
    };
  }, [presetProductId]);

  // Order mode owns its line list: one line per outstanding order line,
  // quantity defaulted to everything still owed because a full delivery is
  // the common case and editing down is easier than typing every figure.
  useEffect(() => {
    if (mode !== "order" || !order.data) return;
    setWarehouseId((current) => current || order.data!.warehouse);
    setLines(
      order.data.lines
        .filter((line) => Number(line.quantity_outstanding) > 0)
        .map((line) =>
          newLine({
            poLineId: line.id,
            product: {
              id: line.product,
              display_name: line.product_name,
              product_code: line.product_code,
            } as MedicineListItem,
            quantity: line.quantity_outstanding,
            unitCost: line.unit_cost,
          }),
        ),
    );
  }, [mode, order.data]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next === "direct") {
      setOrderId("");
      setLines([newLine()]);
    }
  };

  const updateLine = useCallback(
    (key: string, patch: Partial<ReceiptLine>) => {
      setLines((current) =>
        current.map((line) =>
          line.key === key ? { ...line, ...patch } : line,
        ),
      );
    },
    [],
  );

  const orderLineById = (id: number | null): PurchaseOrderLine | undefined =>
    id === null ? undefined : order.data?.lines.find((l) => l.id === id);

  /**
   * Select a product and pre-fill its cost from the catalogue.
   *
   * The catalogue reference cost is only a starting value — the supplier
   * invoice is what actually governs, and the clerk can overwrite it. An
   * untouched cost defaults to the catalogue's, which beats defaulting to
   * zero and silently valuing the delivery at nothing.
   */
  const selectProduct = (line: ReceiptLine, product: MedicineListItem | null) => {
    updateLine(line.key, {
      product,
      ...(product && !line.unitCost ? { unitCost: product.unit_cost } : {}),
    });
  };

  /**
   * Lines the user has actually started filling.
   *
   * A blank trailing line is how someone abandons a row they added by
   * mistake; treating it as an error would make the form nag about a line
   * that is not there yet.
   */
  const startedLines = lines.filter(
    (line) =>
      line.product !== null ||
      line.batchNumber.trim() !== "" ||
      line.expiryDate !== "" ||
      line.quantity !== "",
  );

  const isComplete = (line: ReceiptLine) =>
    line.product !== null &&
    line.batchNumber.trim() !== "" &&
    line.expiryDate !== "" &&
    Number(line.quantity) > 0;

  const shortDated = startedLines.filter((line) => {
    const poLine = orderLineById(line.poLineId);
    if (!poLine?.expected_expiry_date || !line.expiryDate) return false;
    return line.expiryDate < poLine.expected_expiry_date;
  });

  const overReceipt = startedLines.filter((line) => {
    const poLine = orderLineById(line.poLineId);
    if (!poLine) return false;
    return Number(line.quantity) > Number(poLine.quantity_outstanding);
  });

  const expiredLines = startedLines.filter(
    (line) => line.expiryDate !== "" && line.expiryDate < today(),
  );

  /**
   * Two lines for the same product, lot and warehouse.
   *
   * The backend rejects this because the second line would weighted-average
   * its cost against a balance the first had just written, silently moving
   * the first line's cost. Catching it here lets the clerk merge the
   * quantities themselves, which is the decision they should be making.
   */
  const duplicateLots = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const line of startedLines) {
      if (!line.product || !line.batchNumber.trim()) continue;
      const key = [
        line.product.id,
        line.warehouseOverride || warehouseId,
        line.batchNumber.trim().toLowerCase(),
      ].join("|");
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 1) dupes.add(key);
    }
    return dupes;
  }, [startedLines, warehouseId]);

  const lineIsDuplicate = (line: ReceiptLine) => {
    if (!line.product || !line.batchNumber.trim()) return false;
    const key = [
      line.product.id,
      line.warehouseOverride || warehouseId,
      line.batchNumber.trim().toLowerCase(),
    ].join("|");
    return duplicateLots.has(key);
  };

  const readyLines = startedLines.filter(isComplete);

  /**
   * Why the button is disabled, in the user's words.
   *
   * With a dozen lines on a delivery, hunting for the one blank lot number
   * behind a dead button is the slowest part of receiving goods.
   */
  const blockers = [
    mode === "order" && !orderId && t.inventory.selectOrderPlaceholder,
    !warehouseId && t.blockers.selectWarehouse,
    startedLines.length === 0 && t.blockers.addOneLine,
    startedLines.some((l) => l.product === null) && t.blockers.productMissing,
    startedLines.some((l) => l.batchNumber.trim() === "") &&
      t.blockers.batchNumberMissing,
    startedLines.some((l) => l.expiryDate === "") && t.blockers.expiryMissing,
    startedLines.some((l) => !(Number(l.quantity) > 0)) &&
      t.blockers.quantityMissing,
    expiredLines.length > 0 && t.blockers.expiryInPastBlocking,
    duplicateLots.size > 0 && t.blockers.duplicateLotBlocking,
    shortDated.length > 0 && t.blockers.shortDatedBlocking,
    overReceipt.length > 0 && t.blockers.overReceiptBlocking,
  ].filter((entry): entry is string => typeof entry === "string");

  const canSubmit = readyLines.length > 0 && blockers.length === 0;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "order") {
        await api.post(`/purchasing/orders/${orderId}/receive/`, {
          delivery_note_number: deliveryNote,
          quality_checked: false,
          quality_notes: notes,
          lines: readyLines.map((line) => ({
            purchase_order_line: line.poLineId,
            batch_number: line.batchNumber.trim(),
            expiry_date: line.expiryDate,
            manufacturing_date: line.manufacturingDate || undefined,
            quantity_received: line.quantity,
            unit_cost: line.unitCost || undefined,
          })),
        });
      } else {
        // Bulk endpoint rather than one call per line: the whole delivery
        // commits or none of it does, so a failure on line 9 cannot leave
        // lines 1-8 booked with no obvious way to finish the rest.
        await api.post("/inventory/receive/bulk/", {
          source_reference: deliveryNote,
          is_opening_balance: isOpeningBalance,
          notes,
          lines: readyLines.map((line) => ({
            product: line.product!.id,
            warehouse: line.warehouseOverride || warehouseId,
            batch_number: line.batchNumber.trim(),
            expiry_date: line.expiryDate,
            manufacturing_date: line.manufacturingDate || undefined,
            quantity: line.quantity,
            unit_cost: line.unitCost || "0",
          })),
        });
      }

      toast.success(
        t.toasts.goodsReceived,
        t.inventory.receivedSummary.replace(
          "%{count}",
          String(readyLines.length),
        ),
      );
      router.push("/inventory/batches");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (warehouses.loading) {
    return (
      <div className="space-y-5">
        <FormCardSkeleton fields={2} paired />
        <FormCardSkeleton fields={4} paired />
      </div>
    );
  }

  const errorMessage = translateError(error, t);
  const orderOptions = receivableOrders.data?.results ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {t.inventory.receivingTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.inventory.receivingSubtitle}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          {t.common.cancel}
        </Button>
      </div>

      {errorMessage && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {errorMessage}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.purchasing.deliveryNote}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Segmented<Mode>
            ariaLabel={t.inventory.receivingTitle}
            value={mode}
            onChange={switchMode}
            options={[
              {
                value: "order",
                content: t.inventory.modeWithOrder,
                label: t.inventory.modeWithOrder,
              },
              {
                value: "direct",
                content: t.inventory.modeDirect,
                label: t.inventory.modeDirect,
              },
            ]}
          />
          <p className="text-sm text-muted-foreground">
            {mode === "order"
              ? t.inventory.modeWithOrderHint
              : t.inventory.modeDirectHint}
          </p>

          {mode === "order" && (
            <Field label={t.inventory.selectOrder} required>
              <Select
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
              >
                <option value="">
                  {t.inventory.selectOrderPlaceholder}
                </option>
                {orderOptions.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.order_number} - {po.supplier_name}
                  </option>
                ))}
              </Select>
              {orderOptions.length === 0 && !receivableOrders.loading && (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t.inventory.noReceivableOrders}
                </p>
              )}
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.inventory.destinationWarehouse}
              required
              hint={t.inventory.destinationWarehouseHint}
            >
              <ReferenceSelect
                resource="warehouse"
                emptyLabel={t.blockers.selectWarehouse}
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              />
            </Field>
            <Field label={t.purchasing.deliveryNote}>
              <Input
                value={deliveryNote}
                onChange={(event) => setDeliveryNote(event.target.value)}
              />
            </Field>
          </div>

          {mode === "direct" && (
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={isOpeningBalance}
                onChange={(event) =>
                  setIsOpeningBalance(event.target.checked)
                }
              />
              <span>
                <span className="font-medium">
                  {t.inventory.isOpeningBalance}
                </span>
                <span className="block text-muted-foreground">
                  {t.inventory.isOpeningBalanceHint}
                </span>
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.nav.batches}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => {
            const poLine = orderLineById(line.poLineId);
            const isShortDated = shortDated.includes(line);
            const isOver = overReceipt.includes(line);
            const isExpired = expiredLines.includes(line);
            const isDupe = lineIsDuplicate(line);

            return (
              <div
                key={line.key}
                className="space-y-3 rounded-md border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">
                    {t.inventory.lineNumber} {index + 1}
                    {poLine && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {poLine.product_code} ·{" "}
                        {t.purchasing.quantityOutstanding}:{" "}
                        {fmt.quantity(poLine.quantity_outstanding)}
                      </span>
                    )}
                  </p>
                  {mode === "direct" && lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.inventory.removeLine}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((l) => l.key !== line.key),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Product is fixed in order mode — it is what was ordered. */}
                {mode === "direct" ? (
                  <Field label={t.nav.medicines} required>
                    <EntityPicker<MedicineListItem>
                      path="/catalog/medicines/"
                      value={line.product}
                      onChange={(product) => selectProduct(line, product)}
                      getKey={(item) => item.id}
                      getLabel={(item) => item.display_name}
                      getSublabel={(item) => item.product_code}
                      placeholder={t.inventory.productPlaceholder}
                      createResource={
                        can("catalog.add_medicine") ? "medicine" : undefined
                      }
                    />
                  </Field>
                ) : (
                  <p className="text-sm font-medium">
                    {line.product?.display_name}
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label={t.inventory.batchNumber}
                    required
                    hint={t.inventory.lotOnCarton}
                    error={isDupe ? t.blockers.duplicateLotBlocking : undefined}
                  >
                    <Input
                      className="font-mono"
                      value={line.batchNumber}
                      onChange={(event) =>
                        updateLine(line.key, {
                          batchNumber: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field
                    label={t.inventory.expiryDate}
                    required
                    error={
                      isExpired
                        ? t.validation.expiryInPast
                        : isShortDated
                          ? t.blockers.expiryBeforeMinimum
                          : undefined
                    }
                  >
                    <Input
                      type="date"
                      value={line.expiryDate}
                      onChange={(event) =>
                        updateLine(line.key, { expiryDate: event.target.value })
                      }
                    />
                  </Field>

                  <Field
                    label={t.purchasing.quantityReceived}
                    required
                    error={
                      isOver ? t.blockers.quantityAboveOutstanding : undefined
                    }
                  >
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, { quantity: event.target.value })
                      }
                    />
                  </Field>

                  <Field label={t.catalog.unitCost}>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      inputMode="decimal"
                      value={line.unitCost}
                      onChange={(event) =>
                        updateLine(line.key, { unitCost: event.target.value })
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.inventory.manufacturingDate}>
                    <Input
                      type="date"
                      value={line.manufacturingDate}
                      onChange={(event) =>
                        updateLine(line.key, {
                          manufacturingDate: event.target.value,
                        })
                      }
                    />
                  </Field>
                  {mode === "direct" && (
                    <Field label={t.inventory.warehouse}>
                      <ReferenceSelect
                        resource="warehouse"
                        emptyLabel={t.inventory.sameAsHeader}
                        value={line.warehouseOverride}
                        onChange={(event) =>
                          updateLine(line.key, {
                            warehouseOverride: event.target.value,
                          })
                        }
                      />
                    </Field>
                  )}
                </div>
              </div>
            );
          })}

          {mode === "direct" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines((current) => [...current, newLine()])}
            >
              <Plus className="h-4 w-4" />
              {t.inventory.addLine}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.common.notes}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </CardContent>
      </Card>

      {blockers.length > 0 && startedLines.length > 0 && (
        <Alert variant="warning" title={t.blockers.heading}>
          <ul className="list-inside list-disc space-y-1">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Alert>
      )}

      {shortDated.length > 0 && (
        <Alert variant="destructive" title={t.purchasing.minimumExpiry}>
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t.errors.expired_batch}
          </span>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={!canSubmit} loading={submitting}>
          {t.inventory.receiveAll}
        </Button>
      </div>
    </div>
  );
}
