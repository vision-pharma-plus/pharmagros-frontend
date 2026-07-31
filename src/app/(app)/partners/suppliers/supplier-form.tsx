"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import type { Supplier } from "@/lib/api/types";
import { scrollToFirstError, translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

/** Mirrors `apps.core.validators.NIF_PATTERN`, as on the customer form. */
const NIF_PATTERN = /^[0-9]{4}[A-Z0-9]{4,8}$/;

const schema = z
  .object({
    name: z.string().min(2, "name_too_short"),
    nif: z.string().optional(),
    contact_person: z.string().optional(),
    email: z.string().email("email_invalid").optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    payment_terms: z.string(),
    currency: z.string(),
    lead_time_days: z.string().optional(),
    bank_name: z.string().optional(),
    bank_account: z.string().optional(),
    swift_code: z.string().optional(),
    status: z.string(),
    notes: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const normalisedNif = (values.nif ?? "")
      .replace(/[\s\-/.]/g, "")
      .toUpperCase();

    if (normalisedNif && !NIF_PATTERN.test(normalisedNif)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nif"],
        message: "nif_format",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

/**
 * Shared create/edit form.
 *
 * `supplier` absent means create. Splitting these into two near-identical
 * screens is what lets the two drift apart, so both routes render this.
 */
export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const t = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const isEdit = Boolean(supplier);

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: supplier
      ? {
          name: supplier.name,
          nif: supplier.nif,
          contact_person: supplier.contact_person,
          email: supplier.email,
          phone: supplier.phone,
          address: supplier.address,
          city: supplier.city,
          country: supplier.country,
          payment_terms: supplier.payment_terms,
          currency: supplier.currency,
          lead_time_days: String(supplier.lead_time_days),
          bank_name: supplier.bank_name,
          bank_account: supplier.bank_account,
          swift_code: supplier.swift_code,
          status: supplier.status,
          notes: supplier.notes,
        }
      : {
          payment_terms: "NET_30",
          currency: "BIF",
          lead_time_days: "30",
          status: "ACTIVE",
        },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const payload = {
      ...values,
      email: values.email || undefined,
      lead_time_days: Number(values.lead_time_days || 30),
    };

    try {
      const saved = isEdit
        ? await api.patch<Supplier>(
            `/partners/suppliers/${supplier!.id}/`,
            payload,
          )
        : await api.post<Supplier>("/partners/suppliers/", payload);

      toast.success(
        isEdit ? t.toasts.updated : t.toasts.supplierCreated,
        saved.supplier_code,
      );
      router.push(`/partners/suppliers/${saved.id}`);
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

  const fieldMessage = (message?: string) => {
    if (!message) return undefined;
    switch (message) {
      case "nif_format":
        return t.partners.nifFormatInvalid;
      case "name_too_short":
        return t.validation.nameTooShort;
      case "email_invalid":
        return t.validation.emailInvalid;
      default:
        return message;
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
            {isEdit ? t.partners.editSupplier : t.partners.newSupplier}
          </h1>
          <p className="text-sm text-muted-foreground">
            {supplier?.supplier_code ?? t.nav.suppliers}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                isEdit
                  ? `/partners/suppliers/${supplier!.id}`
                  : "/partners/suppliers",
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
            <Field
              label={t.partners.supplierName}
              required
              error={fieldMessage(errors.name?.message)}
            >
              <Input {...register("name")} autoFocus />
            </Field>

            <Field label={t.partners.nif} error={fieldMessage(errors.nif?.message)}>
              <Input {...register("nif")} placeholder="4000123456" />
            </Field>

            <Field label={t.common.status} required>
              <Select {...register("status")}>
                <option value="ACTIVE">{t.status.ACTIVE}</option>
                <option value="INACTIVE">{t.status.INACTIVE}</option>
                <option value="BLOCKED">{t.status.BLOCKED}</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.contactDetails}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.partners.contactPerson}>
              <Input {...register("contact_person")} />
            </Field>

            <Field
              label={t.partners.email}
              error={fieldMessage(errors.email?.message)}
            >
              <Input type="email" {...register("email")} />
            </Field>

            <Field label={t.partners.phone}>
              <Input {...register("phone")} />
            </Field>

            <Field label={t.partners.address}>
              <Input {...register("address")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.partners.city}>
                <Input {...register("city")} />
              </Field>
              {/* Country is deliberately not defaulted: most supply is
                  imported, and a wrong default corrupts origin reporting. */}
              <Field label={t.partners.country}>
                <Input {...register("country")} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.commercialTerms}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.invoicing.paymentTerms} required>
              <Select {...register("payment_terms")}>
                <option value="CASH">{t.paymentTermsOptions.CASH}</option>
                <option value="NET_7">{t.paymentTermsOptions.NET_7}</option>
                <option value="NET_15">{t.paymentTermsOptions.NET_15}</option>
                <option value="NET_30">{t.paymentTermsOptions.NET_30}</option>
                <option value="NET_45">{t.paymentTermsOptions.NET_45}</option>
                <option value="NET_60">{t.paymentTermsOptions.NET_60}</option>
                <option value="NET_90">{t.paymentTermsOptions.NET_90}</option>
              </Select>
            </Field>

            <Field label={t.partners.currency} required>
              <Select {...register("currency")}>
                <option value="BIF">BIF</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>

            <Field label={t.partners.leadTimeDays}>
              <Input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                {...register("lead_time_days")}
              />
            </Field>

            <Field label={t.common.notes}>
              <Textarea rows={2} {...register("notes")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.bankingDetails}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.partners.bankName}>
              <Input {...register("bank_name")} />
            </Field>
            <Field label={t.partners.bankAccount}>
              <Input {...register("bank_account")} />
            </Field>
            <Field label={t.partners.swiftCode}>
              <Input {...register("swift_code")} />
            </Field>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
