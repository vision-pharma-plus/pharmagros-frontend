"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { Medicine } from "@/lib/api/types";
import { priceExclVat } from "@/lib/format";
import { scrollToFirstError, translateError } from "@/lib/hooks";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { useFormat, useTranslation } from "@/lib/i18n/provider";

/**
 * Messages live in the schema so that both client-side failures and mapped
 * server-side failures surface through the same channel — `errors.x.message` —
 * instead of every field rendering one generic "the data is invalid" string.
 */
const buildSchema = (t: Dictionary) =>
  z.object({
    name: z.string().min(2, t.validation.nameTooShort),
    generic_name: z.string().optional(),
    brand_name: z.string().optional(),
    strength: z.string().optional(),
    dosage_form: z.string(),
    pack_size: z.string().optional(),
    category: z.string().min(1, t.validation.selectAnOption),
    manufacturer: z.string().optional(),
    unit_of_measure: z.string().min(1, t.validation.selectAnOption),
    unit_cost: z.string().min(1, t.validation.mustBePositive),
    selling_price: z.string().min(1, t.validation.mustBePositive),
    wholesale_price: z.string().optional(),
    vat_rate: z.string(),
    is_vat_exempt: z.boolean(),
    reorder_level: z.string().optional(),
    safety_stock: z.string().optional(),
    expiry_alert_days: z.string().optional(),
    storage_condition: z.string(),
    requires_prescription: z.boolean(),
    is_controlled: z.boolean(),
    barcode: z.string().optional(),
    registration_number: z.string().optional(),
    notes: z.string().optional(),
  });
  // No batch fields here by design. A lot code and expiry are read off a
  // physical carton, which the person defining a catalogue entry does not
  // necessarily have in front of them — a product is routinely catalogued
  // before its first delivery arrives. Stock, and the lot it belongs to, is
  // captured on the receiving screen where the goods actually are.

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

/**
 * Shared create/edit form.
 *
 * `medicine` absent means create. Both routes render this so the two cannot
 * drift apart as fields are added.
 *
 * Note that price changes made here go through the ordinary update endpoint.
 * The dedicated `change-price` action on the detail screen is the one that
 * records a priced audit trail, and remains the right route for a repricing.
 */
export function MedicineForm({ medicine }: { medicine?: Medicine }) {
  const t = useTranslation();
  const fmt = useFormat();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const isEdit = Boolean(medicine);

  // The five reference lists this form depends on are fetched by the
  // `ReferenceSelect` controls themselves, which is also what lets a record
  // created inline appear and be selected without this component re-rendering
  // from scratch and discarding what the user has typed.

  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(t)),
    // Re-validate as the user corrects a field, so the error clears the moment
    // it is fixed rather than only on the next submit.
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: medicine
      ? {
          name: medicine.name,
          generic_name: medicine.generic_name,
          brand_name: medicine.brand_name,
          strength: medicine.strength,
          dosage_form: medicine.dosage_form,
          pack_size: medicine.pack_size,
          category: medicine.category,
          manufacturer: medicine.manufacturer ?? "",
          unit_of_measure: medicine.unit_of_measure,
          unit_cost: medicine.unit_cost,
          selling_price: medicine.selling_price,
          wholesale_price: medicine.wholesale_price,
          vat_rate: medicine.vat_rate,
          is_vat_exempt: medicine.is_vat_exempt,
          reorder_level: medicine.reorder_level,
          safety_stock: medicine.safety_stock,
          expiry_alert_days: String(medicine.expiry_alert_days),
          storage_condition: medicine.storage_condition,
          requires_prescription: medicine.requires_prescription,
          is_controlled: medicine.is_controlled,
          barcode: medicine.barcode,
          registration_number: medicine.registration_number,
          notes: medicine.notes,
        }
      : {
          dosage_form: "TABLET",
          storage_condition: "AMBIENT",
          vat_rate: "18",
          is_vat_exempt: false,
          requires_prescription: false,
          is_controlled: false,
          unit_cost: "0",
          selling_price: "0",
          reorder_level: "0",
          safety_stock: "0",
          expiry_alert_days: "180",
        },
  });

  const isExempt = watch("is_vat_exempt");
  const unitCost = watch("unit_cost");
  const sellingPrice = watch("selling_price");
  const wholesalePrice = watch("wholesale_price");
  const vatRate = watch("vat_rate");

  // Prices are entered VAT-inclusive, so the effective rate drives both the
  // net-of-VAT preview and the below-cost check below.
  const effectiveVatRate = isExempt ? "0" : vatRate || "0";
  const sellingPriceNet = sellingPrice
    ? priceExclVat(sellingPrice, effectiveVatRate)
    : "";
  const wholesalePriceNet = wholesalePrice
    ? priceExclVat(wholesalePrice, effectiveVatRate)
    : "";

  // Selling below cost is legitimate for clearing short-dated stock, so this
  // is a warning rather than a validation failure — the backend records it in
  // the audit note either way.
  //
  // The comparison is made net of VAT: unit_cost is a purchase cost and
  // carries no VAT, so testing it against the VAT-inclusive selling price
  // would hide genuine below-cost pricing on anything with a margin thinner
  // than the tax rate.
  const belowCost =
    unitCost && sellingPriceNet && Number(sellingPriceNet) < Number(unitCost);

  const onSubmit = async (values: FormValues) => {
    setError(null);

    const payload = {
      ...values,
      manufacturer: values.manufacturer || null,
      vat_rate: values.is_vat_exempt ? "0" : values.vat_rate,
      wholesale_price: values.wholesale_price || "0",
      expiry_alert_days: Number(values.expiry_alert_days || 180),
    };

    try {
      const saved = isEdit
        ? await api.patch<Medicine>(
            `/catalog/medicines/${medicine!.id}/`,
            payload,
          )
        : await api.post<Medicine>("/catalog/medicines/", payload);

      toast.success(
        isEdit ? t.toasts.updated : t.toasts.medicineCreated,
        saved.product_code,
      );
      // A newly catalogued product almost always exists because stock of it
      // is about to arrive, so the receiving screen is offered pre-filled
      // rather than leaving the user to find it. Editing an existing product
      // carries no such implication and returns to the detail page.
      router.push(
        isEdit
          ? `/catalog/medicines/${saved.id}`
          : `/inventory/receive?product=${saved.id}`,
      );
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) });
      for (const [field, messages] of Object.entries(apiError.fieldErrors)) {
        setFieldError(field as keyof FormValues, {
          type: "server",
          message: messages.join(" "),
        });
      }
      setError(apiError);
      scrollToFirstError(Object.keys(apiError.fieldErrors));
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit, (formErrors) =>
        scrollToFirstError(Object.keys(formErrors)),
      )}
      className="space-y-5"
      noValidate
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isEdit ? t.catalog.editMedicine : t.nav.newMedicine}
          </h1>
          <p className="text-sm text-muted-foreground">
            {medicine?.product_code ?? t.nav.medicines}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                isEdit
                  ? `/catalog/medicines/${medicine!.id}`
                  : "/catalog/medicines",
              )
            }
          >
            {t.common.cancel}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {t.common.save}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateError(error, t)}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.identification}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.catalog.name} required error={errors.name?.message}>
              <Input {...register("name")} autoFocus />
            </Field>

            <Field label={t.catalog.genericName}>
              <Input {...register("generic_name")} />
            </Field>

            <Field label={t.catalog.brandName}>
              <Input {...register("brand_name")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.catalog.strength}>
                <Input {...register("strength")} placeholder="500 mg" />
              </Field>
              <Field label={t.catalog.dosageForm} required>
                <Select {...register("dosage_form")}>
                  {Object.entries(t.dosageForms).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label={t.catalog.packSize}>
              <Input
                {...register("pack_size")}
                placeholder={t.catalog.packSizePlaceholder}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t.catalog.category}
                required
                error={errors.category?.message}
              >
                <ReferenceSelect
                  resource="category"
                  emptyLabel={t.common.none}
                  {...register("category")}
                />
              </Field>

              <Field
                label={t.catalog.unitOfMeasure}
                required
                error={errors.unit_of_measure?.message}
              >
                <ReferenceSelect
                  resource="unitOfMeasure"
                  emptyLabel={t.common.none}
                  {...register("unit_of_measure")}
                />
              </Field>
            </div>

            <Field label={t.catalog.manufacturer}>
              <ReferenceSelect
                resource="manufacturer"
                emptyLabel={t.common.none}
                {...register("manufacturer")}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.pricingAndTax}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stated once, up front and unmissable. Getting this wrong prices
                an entire catalogue 18% off, and the label suffix alone is too
                easy to skim past when entering products in bulk. */}
            <Alert>{t.catalog.priceInclVatHint}</Alert>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* No hint here: the "reference" in the label carries the
                  distinction, and the purchase order screen — where the two
                  costs could actually be confused — shows this value inline
                  beside the supplier's price. Explaining it twice made the
                  most-used field on the form the wordiest. */}
              <Field label={`${t.catalog.unitCost} (BIF)`} required>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  inputMode="decimal"
                  {...register("unit_cost")}
                />
              </Field>
              <Field
                label={`${t.catalog.sellingPrice} (BIF)`}
                // Echoing the derived net figure back is the real safeguard:
                // whoever types 180 sees at once that the system read it as a
                // VAT-inclusive price, without needing to trust the label.
                hint={
                  sellingPriceNet
                    ? `${t.catalog.priceExclVat}: ${fmt.money(sellingPriceNet, { decimals: 2 })}`
                    : undefined
                }
                required
              >
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  inputMode="decimal"
                  {...register("selling_price")}
                />
              </Field>
            </div>

            {belowCost && (
              <Alert variant="warning">
                {t.catalog.sellingPrice} &lt; {t.catalog.unitCost}
              </Alert>
            )}

            <Field
              label={`${t.catalog.wholesalePrice} (BIF)`}
              hint={
                wholesalePriceNet
                  ? `${t.catalog.priceExclVat}: ${fmt.money(wholesalePriceNet, { decimals: 2 })}`
                  : undefined
              }
            >
              <Input
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                {...register("wholesale_price")}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...register("is_vat_exempt")}
              />
              {t.catalog.vatExempt}
            </label>

            <Field label={`${t.catalog.vatRate} %`}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                disabled={isExempt}
                {...register("vat_rate")}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.stockSettings}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/*
              These are reorder thresholds, not stock. Saying so here heads off
              the reasonable assumption that filling this section puts units on
              the shelf.
            */}
            <p className="text-sm text-muted-foreground">
              {t.catalog.stockEntryHint}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.catalog.reorderLevel}>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  inputMode="decimal"
                  {...register("reorder_level")}
                />
              </Field>
              <Field label={t.catalog.safetyStock}>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  inputMode="decimal"
                  {...register("safety_stock")}
                />
              </Field>
            </div>

            <Field
              label={t.catalog.expiryAlertDays}
              hint={t.catalog.expiryAlertDaysHint}
            >
              <Input
                type="number"
                min="0"
                step="1"
                {...register("expiry_alert_days")}
              />
            </Field>

            <Field label={t.catalog.storageCondition} required>
              <Select {...register("storage_condition")}>
                {Object.entries(t.storageConditions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.regulatory}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.catalog.registrationNumber}>
              <Input {...register("registration_number")} />
            </Field>

            <Field label={t.catalog.barcode}>
              <Input {...register("barcode")} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...register("requires_prescription")}
              />
              {t.catalog.requiresPrescription}
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...register("is_controlled")}
              />
              {t.catalog.isControlled}
            </label>

            <Field label={t.common.notes}>
              <Textarea rows={2} {...register("notes")} />
            </Field>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
