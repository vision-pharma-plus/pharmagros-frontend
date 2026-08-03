"use client";

/**
 * Raise or amend a purchase order.
 *
 * A purchase order is the document that authorises a supplier to ship goods,
 * so it has to be something a user can actually produce: without this screen
 * the backend's whole procurement lifecycle — submit, approve, send, receive —
 * had no way to begin, and no order could exist to receive stock against.
 *
 * Create and edit share one component because they are the same document in
 * two states. Editing is confined to DRAFT and REJECTED by the service; once
 * an order carries an approval, changing its quantities would invalidate the
 * signature someone put on it.
 */

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { MedicineListItem, PurchaseOrder } from "@/lib/api/types";
import { translateError } from "@/lib/hooks";
import { useFormat, useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

interface OrderLine {
  key: string;
  product: MedicineListItem | null;
  productName: string;
  quantity: string;
  unitCost: string;
  /**
   * The catalogue reference cost of the selected product, kept beside the
   * entered cost so the hint can show what the reference was even after the
   * buyer overwrites the field with the supplier's actual quote.
   */
  catalogCost: string;
  discountPercent: string;
  expectedExpiry: string;
}

let lineCounter = 0;
const newLine = (over: Partial<OrderLine> = {}): OrderLine => ({
  key: `po-line-${(lineCounter += 1)}`,
  product: null,
  productName: "",
  quantity: "",
  unitCost: "",
  catalogCost: "",
  discountPercent: "",
  expectedExpiry: "",
  ...over,
});

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Net of discount, before VAT — matches the backend's `compute_line`. */
const lineNet = (line: OrderLine): number => {
  const gross = num(line.quantity) * num(line.unitCost);
  return gross - (gross * num(line.discountPercent)) / 100;
};

export function OrderForm({ order }: { order?: PurchaseOrder }) {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const can = useAuth((state) => state.can);
  const isEdit = Boolean(order);

  const [supplier, setSupplier] = useState(order?.supplier ?? "");
  const [warehouse, setWarehouse] = useState(order?.warehouse ?? "");
  const [expectedDelivery, setExpectedDelivery] = useState(
    order?.expected_delivery_date ?? "",
  );
  const [supplierReference, setSupplierReference] = useState(
    order?.supplier_reference ?? "",
  );
  const [freight, setFreight] = useState(order?.freight_cost ?? "");
  const [duty, setDuty] = useState(order?.customs_duty ?? "");
  const [otherCharges, setOtherCharges] = useState(order?.other_charges ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [lines, setLines] = useState<OrderLine[]>(
    order
      ? order.lines.map((line) =>
          newLine({
            product: {
              id: line.product,
              display_name: line.product_name,
              product_code: line.product_code,
            } as MedicineListItem,
            productName: line.product_name,
            quantity: line.quantity_ordered,
            unitCost: line.unit_cost,
            // Deliberately left blank: on an existing order the agreed cost is
            // authoritative, and showing today's catalogue reference beside it
            // would invite someone to "correct" a price already placed.
            catalogCost: "",
            discountPercent: line.discount_percent,
            expectedExpiry: line.expected_expiry_date ?? "",
          }),
        )
      : [newLine()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const updateLine = (key: string, patch: Partial<OrderLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const startedLines = lines.filter(
    (line) =>
      line.product !== null || line.quantity !== "" || line.unitCost !== "",
  );
  const readyLines = startedLines.filter(
    (line) => line.product !== null && num(line.quantity) > 0,
  );

  const goodsTotal = readyLines.reduce((sum, line) => sum + lineNet(line), 0);
  const landedTotal =
    goodsTotal + num(freight) + num(duty) + num(otherCharges);

  const blockers = [
    !supplier && t.blockers.selectSupplier,
    !warehouse && t.blockers.selectWarehouse,
    startedLines.length === 0 && t.blockers.addOneLine,
    startedLines.some((line) => line.product === null) &&
      t.blockers.productMissing,
    startedLines.some((line) => !(num(line.quantity) > 0)) &&
      t.blockers.quantityMissing,
    // A zero unit cost previously sailed through — the field is only required
    // in the markup, and the payload coerces "" to "0". That produced a
    // valueless order line and, on receipt, a zero-cost batch that silently
    // understates inventory value.
    startedLines.some((line) => !(num(line.unitCost) > 0)) &&
      t.purchasing.unitCostZeroWarning,
  ].filter((entry): entry is string => typeof entry === "string");

  const canSubmit = readyLines.length > 0 && blockers.length === 0;

  const buildPayload = () => ({
    supplier,
    warehouse,
    expected_delivery_date: expectedDelivery || null,
    supplier_reference: supplierReference,
    freight_cost: freight || "0",
    customs_duty: duty || "0",
    other_charges: otherCharges || "0",
    notes,
    lines: readyLines.map((line) => ({
      product: line.product!.id,
      quantity_ordered: line.quantity,
      unit_cost: line.unitCost || "0",
      discount_percent: line.discountPercent || "0",
      expected_expiry_date: line.expectedExpiry || null,
    })),
  });

  /**
   * `submitAfter` raises the order and sends it for approval in one action.
   *
   * Saving and then submitting are two clicks on two screens for what is
   * usually a single intent, and a draft left unsubmitted is invisible to
   * whoever has to approve it.
   */
  const save = async (submitAfter: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit
        ? await api.put<PurchaseOrder>(
            `/purchasing/orders/${order!.id}/`,
            buildPayload(),
          )
        : await api.post<PurchaseOrder>("/purchasing/orders/", buildPayload());

      if (submitAfter) {
        await api.post(`/purchasing/orders/${saved.id}/submit/`, {});
      }

      toast.success(
        isEdit ? t.toasts.updated : t.toasts.created,
        saved.order_number,
      );
      router.push(`/purchasing/orders/${saved.id}`);
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

  const errorMessage = translateError(error, t);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isEdit ? t.purchasing.editOrder : t.purchasing.newOrder}
          </h1>
          <p className="text-sm text-muted-foreground">
            {order?.order_number ?? t.nav.purchaseOrders}
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
          <CardTitle>{t.purchasing.supplier}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.purchasing.supplier} required>
              <ReferenceSelect
                resource="supplier"
                emptyLabel={t.blockers.selectSupplier}
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
              />
            </Field>
            <Field label={t.purchasing.deliveryWarehouse} required>
              <ReferenceSelect
                resource="warehouse"
                emptyLabel={t.blockers.selectWarehouse}
                value={warehouse}
                onChange={(event) => setWarehouse(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.purchasing.expectedDelivery}>
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(event) => setExpectedDelivery(event.target.value)}
              />
            </Field>
            <Field label={t.purchasing.supplierReference}>
              <Input
                value={supplierReference}
                onChange={(event) => setSupplierReference(event.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.purchasing.orderLines}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="space-y-3 rounded-md border border-border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  {t.inventory.lineNumber} {index + 1}
                </p>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.purchasing.removeOrderLine}
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

              <Field label={t.nav.medicines} required>
                <EntityPicker<MedicineListItem>
                  path="/catalog/medicines/"
                  value={line.product}
                  onChange={(product) =>
                    updateLine(line.key, {
                      product,
                      productName: product?.display_name ?? "",
                      catalogCost: product?.unit_cost ?? "",
                      // Seed the catalogue reference so the common case — the
                      // supplier charges the expected price — needs no typing.
                      // Only ever fills a blank field: a cost already entered
                      // is the buyer's, and swapping the product underneath it
                      // must not silently discard a negotiated figure.
                      ...(line.unitCost === "" && product
                        ? { unitCost: product.unit_cost }
                        : {}),
                    })
                  }
                  getKey={(item) => item.id}
                  getLabel={(item) => item.display_name}
                  getSublabel={(item) => item.product_code}
                  placeholder={t.inventory.productPlaceholder}
                  createResource={
                    can("catalog.add_medicine") ? "medicine" : undefined
                  }
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t.purchasing.quantityOrdered} required>
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
                <Field
                  label={t.purchasing.unitCost}
                  // Showing the catalogue figure alongside — rather than only
                  // as a prefill — keeps the two costs visibly distinct: this
                  // input is what the supplier charges, the hint is what the
                  // catalogue expected.
                  hint={
                    num(line.catalogCost) > 0
                      ? t.purchasing.unitCostCatalogHint.replace(
                          "%{cost}",
                          fmt.money(line.catalogCost, { decimals: 2 }),
                        )
                      : undefined
                  }
                  required
                >
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
                <Field label={t.purchasing.discountPercent}>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={line.discountPercent}
                    onChange={(event) =>
                      updateLine(line.key, {
                        discountPercent: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field
                  label={t.purchasing.minimumExpiry}
                  hint={t.purchasing.minimumExpiryHint}
                >
                  <Input
                    type="date"
                    value={line.expectedExpiry}
                    onChange={(event) =>
                      updateLine(line.key, {
                        expectedExpiry: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <p className="text-sm text-muted-foreground">
                {t.purchasing.lineTotal}: {fmt.money(String(lineNet(line)))}
              </p>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => setLines((current) => [...current, newLine()])}
          >
            <Plus className="h-4 w-4" />
            {t.purchasing.addOrderLine}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.purchasing.landedCosts}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t.purchasing.landedCostsHint}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.purchasing.freightCost}>
              <Input
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={freight}
                onChange={(event) => setFreight(event.target.value)}
              />
            </Field>
            <Field label={t.purchasing.customsDuty}>
              <Input
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={duty}
                onChange={(event) => setDuty(event.target.value)}
              />
            </Field>
            <Field label={t.purchasing.otherCharges}>
              <Input
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                value={otherCharges}
                onChange={(event) => setOtherCharges(event.target.value)}
              />
            </Field>
          </div>

          <dl className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {t.purchasing.orderSubtotal}
              </dt>
              <dd>{fmt.money(String(goodsTotal))}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>{t.common.total}</dt>
              <dd>{fmt.money(String(landedTotal))}</dd>
            </div>
          </dl>
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

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => save(false)}
          disabled={!canSubmit}
          loading={submitting}
        >
          {t.purchasing.saveDraft}
        </Button>
        {can("purchasing.submit_order") && (
          <Button
            onClick={() => save(true)}
            disabled={!canSubmit}
            loading={submitting}
          >
            {t.purchasing.saveAndSubmit}
          </Button>
        )}
      </div>
    </div>
  );
}
