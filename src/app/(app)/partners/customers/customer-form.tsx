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
import type { Customer } from "@/lib/api/types";
import { scrollToFirstError, translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { isValidPhone } from "@/lib/phone";

/**
 * NIF pattern, mirroring `apps.core.validators.NIF_PATTERN`.
 *
 * Deliberately permissive — OBR formats vary by issuance era, and wrongly
 * rejecting a legitimate taxpayer at data entry is worse than accepting a
 * malformed value that the server will also validate.
 */
const NIF_PATTERN = /^[0-9]{4}[A-Z0-9]{4,8}$/;

const CREDIT_TERMS = new Set([
  "NET_7",
  "NET_15",
  "NET_30",
  "NET_45",
  "NET_60",
  "NET_90",
]);

/**
 * Issues carry a code that the screen maps to a translated message, so the
 * schema stays locale-independent while the user still sees a specific
 * explanation rather than a blanket "invalid data".
 */
const schema = z
  .object({
    business_name: z.string().min(2, "name_too_short"),
    trading_name: z.string().optional(),
    customer_type: z.string(),
    nif: z.string().optional(),
    rc_number: z.string().optional(),
    contact_person: z.string().optional(),
    email: z.string().email("email_invalid").optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    pharmacy_licence: z.string().optional(),
    licence_expiry: z.string().optional(),
    payment_terms: z.string(),
    credit_limit: z.string().optional(),
    discount_percent: z.string().optional(),
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

    // Same rule the backend enforces: a customer on credit terms must be
    // identifiable to the tax authority.
    if (CREDIT_TERMS.has(values.payment_terms) && !normalisedNif) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nif"],
        message: "nif_required_for_credit",
      });
    }

    if (!isValidPhone(values.phone ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "invalid_phone",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

/**
 * Shared create/edit form. `customer` absent means create.
 *
 * The credit limit is editable here on create only. On an existing customer
 * it is changed through the dedicated `credit-limit` action on the detail
 * screen, which requires its own permission and records a reason — a credit
 * decision that leaves no trail is exactly what that endpoint exists to
 * prevent.
 */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const t = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const isEdit = Boolean(customer);

  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: customer
      ? {
          business_name: customer.business_name,
          trading_name: customer.trading_name,
          customer_type: customer.customer_type,
          nif: customer.nif,
          rc_number: customer.rc_number,
          contact_person: customer.contact_person,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          province: customer.province,
          pharmacy_licence: customer.pharmacy_licence,
          licence_expiry: customer.licence_expiry ?? "",
          payment_terms: customer.payment_terms,
          discount_percent: customer.discount_percent,
          notes: customer.notes,
        }
      : {
          customer_type: "PHARMACY",
          payment_terms: "CASH",
          city: "Bujumbura",
          credit_limit: "0",
          discount_percent: "0",
        },
  });

  const paymentTerms = watch("payment_terms");
  const isCreditCustomer = CREDIT_TERMS.has(paymentTerms);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const payload: Record<string, unknown> = {
      ...values,
      email: values.email || undefined,
      licence_expiry: values.licence_expiry || undefined,
    };
    // Never sent on update — see the note on the component.
    if (isEdit) delete payload.credit_limit;

    try {
      const saved = isEdit
        ? await api.patch<Customer>(
            `/partners/customers/${customer!.id}/`,
            payload,
          )
        : await api.post<Customer>("/partners/customers/", payload);

      toast.success(
        isEdit ? t.toasts.updated : t.toasts.customerCreated,
        saved.customer_code,
      );
      router.push(`/partners/customers/${saved.id}`);
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) });

      // Map server-side field errors back onto the form so they appear beside
      // the offending input rather than only in a banner.
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

  /**
   * Schema issues carry a code; server-side issues carry a ready message.
   * Anything unrecognised is a server message and is shown as-is rather than
   * being flattened into a generic "invalid data".
   */
  const fieldMessage = (message?: string) => {
    if (!message) return undefined;
    switch (message) {
      case "nif_required_for_credit":
        return t.partners.nifRequiredForCredit;
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

  const nifMessage = fieldMessage(errors.nif?.message);

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
            {isEdit ? t.partners.editCustomer : t.nav.newCustomer}
          </h1>
          <p className="text-sm text-muted-foreground">
            {customer?.customer_code ?? t.nav.customers}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                isEdit
                  ? `/partners/customers/${customer!.id}`
                  : "/partners/customers",
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
            <CardTitle>{t.partners.businessName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label={t.partners.businessName}
              required
              error={fieldMessage(errors.business_name?.message)}
            >
              <Input {...register("business_name")} autoFocus />
            </Field>

            <Field label={t.partners.tradingName}>
              <Input {...register("trading_name")} />
            </Field>

            <Field label={t.partners.customerType} required>
              <Select {...register("customer_type")}>
                <option value="PHARMACY">{t.customerTypes.PHARMACY}</option>
                <option value="HOSPITAL">{t.customerTypes.HOSPITAL}</option>
                <option value="CLINIC">{t.customerTypes.CLINIC}</option>
                <option value="HEALTH_CENTRE">
                  {t.customerTypes.HEALTH_CENTRE}
                </option>
                <option value="NGO">{t.customerTypes.NGO}</option>
                <option value="GOVERNMENT">{t.customerTypes.GOVERNMENT}</option>
                <option value="WHOLESALER">{t.customerTypes.WHOLESALER}</option>
                <option value="OTHER">{t.customerTypes.OTHER}</option>
              </Select>
            </Field>

            <Field
              label={t.partners.nif}
              required={isCreditCustomer}
              error={nifMessage}
              hint={
                isCreditCustomer ? t.partners.nifRequiredForCredit : undefined
              }
            >
              <Input {...register("nif")} placeholder="4000123456" />
            </Field>

            <Field label={t.partners.rcNumber}>
              <Input {...register("rc_number")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.contactPerson}</CardTitle>
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

            <Field
              label={t.partners.phone}
              error={fieldMessage(errors.phone?.message)}
            >
              <Input {...register("phone")} placeholder="+257 79 123 456" />
            </Field>

            <Field label={t.partners.address}>
              <Input {...register("address")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.partners.city}>
                <Input {...register("city")} />
              </Field>
              <Field label={t.partners.province}>
                <Input {...register("province")} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.pharmacyLicence}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.partners.pharmacyLicence}>
              <Input {...register("pharmacy_licence")} />
            </Field>
            <Field
              label={t.partners.licenceExpiry}
              hint={t.partners.licenceExpiredWarning}
            >
              <Input type="date" {...register("licence_expiry")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.partners.creditLimit}</CardTitle>
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

            {isEdit ? (
              <Alert>{t.partners.creditLimitChangedElsewhere}</Alert>
            ) : (
              <Field label={`${t.partners.creditLimit} (BIF)`}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  {...register("credit_limit")}
                />
              </Field>
            )}

            <Field label={`${t.sales.discount} %`}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                {...register("discount_percent")}
              />
            </Field>

            <Field label={t.common.notes}>
              <Textarea rows={2} {...register("notes")} />
            </Field>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
