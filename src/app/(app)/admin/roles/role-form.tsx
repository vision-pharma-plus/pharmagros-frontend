"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api, type Paginated } from "@/lib/api/client";
import type { Permission, Role } from "@/lib/api/types";
import { scrollToFirstError, translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

const schema = z.object({
  code: z.string().min(2, "field_required"),
  name_fr: z.string().min(1, "field_required"),
  name_en: z.string().min(1, "field_required"),
  description_fr: z.string().optional(),
  description_en: z.string().optional(),
  inherits_from: z.string().optional(),
  is_active: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function RoleForm({ role }: { role?: Role }) {
  const t = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const isEdit = Boolean(role);

  const permissions = useQuery<Paginated<Permission>>("/auth/permissions/", {
    page_size: 500,
  });
  const roles = useQuery<Paginated<Role>>("/auth/roles/", { page_size: 200 });

  const [selected, setSelected] = useState<number[]>(role?.permissions ?? []);

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: role
      ? {
          code: role.code,
          name_fr: role.name_fr,
          name_en: role.name_en,
          description_fr: role.description_fr,
          description_en: role.description_en,
          inherits_from: role.inherits_from ?? "",
          is_active: String(role.is_active),
        }
      : { is_active: "true", inherits_from: "" },
  });

  /**
   * Permissions grouped by module.
   *
   * A flat list of several hundred checkboxes is unusable; grouping by the
   * module the backend already assigns keeps the choice scannable.
   */
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions.data?.results ?? []) {
      const list = map.get(permission.module) ?? [];
      list.push(permission);
      map.set(permission.module, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions.data]);

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const payload = {
      ...values,
      inherits_from: values.inherits_from || null,
      is_active: values.is_active === "true",
      permissions: selected,
    };

    try {
      const saved = isEdit
        ? await api.patch<Role>(`/auth/roles/${role!.id}/`, payload)
        : await api.post<Role>("/auth/roles/", payload);

      toast.success(isEdit ? t.toasts.updated : t.toasts.created, saved.code);
      router.push(`/admin/roles/${saved.id}`);
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

  const fieldMessage = (message?: string) =>
    message === "field_required" ? t.validation.fieldRequired : message;

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
            {isEdit ? t.admin.editRole : t.admin.newRole}
          </h1>
          <p className="text-sm text-muted-foreground">
            {role?.code ?? t.nav.roles}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(isEdit ? `/admin/roles/${role!.id}` : "/admin/roles")
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
              label={t.admin.roleCode}
              required
              error={fieldMessage(errors.code?.message)}
            >
              {/* The code is the string permission checks are written
                  against, so it is set once at creation and fixed after. */}
              <Input {...register("code")} disabled={isEdit} autoFocus={!isEdit} />
            </Field>

            <Field
              label={`${t.catalog.name} (FR)`}
              required
              error={fieldMessage(errors.name_fr?.message)}
            >
              <Input {...register("name_fr")} />
            </Field>

            <Field
              label={`${t.catalog.name} (EN)`}
              required
              error={fieldMessage(errors.name_en?.message)}
            >
              <Input {...register("name_en")} />
            </Field>

            <Field label={t.admin.inheritsFrom}>
              <Select {...register("inherits_from")}>
                <option value="">{t.common.none}</option>
                {(roles.data?.results ?? [])
                  .filter((item) => item.id !== role?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label={t.common.status} required>
              <Select {...register("is_active")}>
                <option value="true">{t.admin.active}</option>
                <option value="false">{t.status.INACTIVE}</option>
              </Select>
            </Field>

            <Field label={`${t.catalog.description} (FR)`}>
              <Textarea rows={2} {...register("description_fr")} />
            </Field>
            <Field label={`${t.catalog.description} (EN)`}>
              <Textarea rows={2} {...register("description_en")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.permissions}</CardTitle>
          </CardHeader>
          <CardContent>
            {permissions.loading ? (
              // Module heading followed by its checkbox rows, as grouped below.
              <div className="max-h-[32rem] space-y-4 overflow-hidden pr-1">
                {Array.from({ length: 5 }).map((_, moduleIndex) => (
                  <div key={moduleIndex}>
                    <Skeleton className="mb-1.5 h-3 w-24" />
                    <div className="space-y-1">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="flex items-start gap-2 py-0.5">
                          <Skeleton className="h-4 w-4 shrink-0" />
                          <Skeleton className="h-4 w-full max-w-[16rem]" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                {grouped.map(([module, items]) => (
                  <div key={module}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {module}
                    </p>
                    <div className="space-y-1">
                      {items.map((permission) => (
                        <label
                          key={permission.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                            checked={selected.includes(permission.id)}
                            onChange={() => toggle(permission.id)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate">
                              {permission.name}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {permission.code}
                            </span>
                          </span>
                          {permission.is_sensitive && (
                            <Badge variant="warning" className="ml-auto shrink-0">
                              {t.admin.sensitivePermission}
                            </Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
