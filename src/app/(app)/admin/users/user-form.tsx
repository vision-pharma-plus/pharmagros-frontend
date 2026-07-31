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
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { Role, User } from "@/lib/api/types";
import { scrollToFirstError, translateError, useQuery } from "@/lib/hooks";
import { localizedName, useLocale } from "@/lib/i18n/provider";
import {
  PASSWORD_RULES,
  evaluatePassword,
  isPasswordValid,
} from "@/lib/password-policy";
import { isValidPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

// Length limits mirror the model fields in apps/accounts/models.py; exceeding
// them is a 400 from the server, so the form stops it first.
const schema = z.object({
  first_name: z.string().min(1, "field_required").max(100, "too_long"),
  last_name: z.string().min(1, "field_required").max(100, "too_long"),
  email: z.string().min(1, "field_required").email("email_invalid"),
  phone: z
    .string()
    .optional()
    .refine((value) => isValidPhone(value ?? ""), "phone_invalid"),
  employee_code: z.string().max(32, "too_long").optional(),
  job_title: z.string().max(100, "too_long").optional(),
  language: z.string(),
  is_active: z.string(),
  // Blank is allowed — the backend then generates a temporary password. But a
  // password that *is* typed must satisfy the policy, so the form blocks save
  // instead of letting the server reject it with a 400.
  password: z
    .string()
    .optional()
    .refine((value) => !value || isPasswordValid(value), "password_policy"),
});

type FormValues = z.infer<typeof schema>;

export function UserForm({ user }: { user?: User }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const isEdit = Boolean(user);

  const roles = useQuery<Paginated<Role>>("/auth/roles/", { page_size: 200 });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user?.roles ?? [],
  );

  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: user
      ? {
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          employee_code: user.employee_code,
          job_title: user.job_title,
          language: user.language,
          is_active: String(user.is_active),
        }
      : { language: "fr", is_active: "true" },
  });

  const toggleRole = (id: string) =>
    setSelectedRoles((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );

  // Drives the live rule checklist. Only meaningful on create, where the
  // password field is shown at all.
  const passwordValue = watch("password") ?? "";
  const ruleState = evaluatePassword(passwordValue);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const payload: Record<string, unknown> = {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      phone: values.phone ?? "",
      employee_code: values.employee_code ?? "",
      job_title: values.job_title ?? "",
      language: values.language,
      is_active: values.is_active === "true",
      roles: selectedRoles,
    };

    // Only sent on create, and only when filled: the backend generates a
    // temporary password when it is omitted. Changing an existing user's
    // password goes through the dedicated reset action instead.
    if (!isEdit && values.password) payload.password = values.password;

    try {
      const saved = isEdit
        ? await api.patch<User>(`/auth/users/${user!.id}/`, payload)
        : await api.post<User>("/auth/users/", payload);

      toast.success(isEdit ? t.toasts.updated : t.toasts.userCreated, saved.email);
      router.push(`/admin/users/${saved.id}`);
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
      case "field_required":
        return t.validation.fieldRequired;
      case "email_invalid":
        return t.validation.emailInvalid;
      case "password_policy":
        return t.passwordPolicy.notMet;
      case "phone_invalid":
        return t.validation.phoneInvalid;
      case "too_long":
        return t.validation.tooLong;
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
            {isEdit ? t.admin.editUser : t.admin.newUser}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user?.email ?? t.nav.users}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(isEdit ? `/admin/users/${user!.id}` : "/admin/users")
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t.admin.firstName}
                required
                error={fieldMessage(errors.first_name?.message)}
              >
                <Input {...register("first_name")} autoFocus />
              </Field>
              <Field
                label={t.admin.lastName}
                required
                error={fieldMessage(errors.last_name?.message)}
              >
                <Input {...register("last_name")} />
              </Field>
            </div>

            <Field
              label={t.partners.email}
              required
              error={fieldMessage(errors.email?.message)}
            >
              <Input type="email" {...register("email")} />
            </Field>

            <Field
              label={t.partners.phone}
              hint={t.validation.phoneFormatHint}
              error={fieldMessage(errors.phone?.message)}
            >
              <Input {...register("phone")} inputMode="tel" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t.admin.employeeCode}
                error={fieldMessage(errors.employee_code?.message)}
              >
                <Input maxLength={32} {...register("employee_code")} />
              </Field>
              <Field
                label={t.admin.jobTitle}
                error={fieldMessage(errors.job_title?.message)}
              >
                <Input maxLength={100} {...register("job_title")} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.accessAndRoles}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t.admin.language} required>
              <Select {...register("language")}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            </Field>

            <Field label={t.common.status} required>
              <Select {...register("is_active")}>
                <option value="true">{t.admin.active}</option>
                <option value="false">{t.status.INACTIVE}</option>
              </Select>
            </Field>

            {!isEdit && (
              <div className="space-y-2">
                <Field
                  label={t.auth.password}
                  hint={t.admin.leaveBlankToGenerate}
                  error={fieldMessage(errors.password?.message)}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...register("password")}
                  />
                </Field>

                {/* The policy is only relevant once a password is being typed;
                    showing it against a blank field would contradict the
                    "leave blank to generate" hint directly above. */}
                {passwordValue.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-1.5 text-sm font-medium">
                      {t.passwordPolicy.heading}
                    </p>
                    {/* Polite live region: rules flip as the user types, and
                        each change should be announced without interrupting. */}
                    <ul className="space-y-1" aria-live="polite">
                      {PASSWORD_RULES.map((rule) => {
                        const met = ruleState[rule.id];
                        return (
                          <li
                            key={rule.id}
                            className={cn(
                              "flex items-center gap-2 text-sm",
                              met ? "text-success" : "text-muted-foreground",
                            )}
                          >
                            {/* Decorative: colour and glyph both restate the
                                state that the sr-only text carries in words,
                                so colour is never the only signal. */}
                            <span aria-hidden="true" className="w-3 text-center">
                              {met ? "✓" : "•"}
                            </span>
                            <span>{t.passwordPolicy[rule.id]}</span>
                            <span className="sr-only">
                              {met ? t.passwordPolicy.ruleMet : t.passwordPolicy.ruleUnmet}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t.admin.roles}</p>
              {roles.loading ? (
                // The bordered checkbox list this resolves to.
                <div className="space-y-1.5 rounded-md border border-border p-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 shrink-0" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5 rounded-md border border-border p-3">
                  {(roles.data?.results ?? [])
                    .filter((role) => role.is_active)
                    .map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={selectedRoles.includes(role.id)}
                          onChange={() => toggleRole(role.id)}
                        />
                        <span>{localizedName(role, locale)}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {role.code}
                        </span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
