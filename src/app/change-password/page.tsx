"use client";

/**
 * Forced password change.
 *
 * Deliberately outside the `(app)` segment: a user carrying
 * `must_change_password` is authenticated, but the backend rejects the rest of
 * the API until the password is changed, so rendering the app shell here would
 * fill the screen with failed requests. This route needs only the one endpoint
 * that still answers.
 *
 * Changing the password revokes every session server-side, including this one,
 * so the flow ends at the login screen rather than the dashboard — the tokens
 * in hand are dead the moment the call succeeds.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LanguageSwitcher } from "@/components/language-switcher";
import { BRAND_NAME, Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { api, ApiError, tokens } from "@/lib/api/client";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    confirmPassword: z.string().min(1),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    params: { mismatch: true },
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const t = useTranslation();
  const router = useRouter();
  const { status, mustChangePassword } = useAuth();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const onSubmit = async (values: FormValues) => {
    try {
      await api.changePassword(values.currentPassword, values.newPassword);

      // The server has revoked this session along with all the others, so the
      // tokens are already worthless. Clearing them locally keeps the client
      // from replaying a dead token on the way out.
      tokens.clear();
      useAuth.setState({
        user: null,
        status: "unauthenticated",
        mustChangePassword: false,
      });

      toast.success(t.auth.passwordChanged);
      router.replace("/login");
    } catch (error) {
      if (error instanceof ApiError) {
        // The backend validates the new password against Django's validators;
        // surfacing those on the field beats a generic banner.
        const fieldErrors = error.fieldErrors;
        const current = fieldErrors.current_password?.[0];
        const next = fieldErrors.new_password?.[0];

        if (current) setError("currentPassword", { message: current });
        if (next) setError("newPassword", { message: next });
        if (!current && !next) {
          setError("root", { message: error.message });
        }
        return;
      }
      setError("root", { message: t.errors.internal_error });
    }
  };

  if (status !== "authenticated") return null;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex h-16 shrink-0 items-center justify-end px-4 lg:px-6">
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-24">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <Logo className="mb-3 h-14" priority />
            <CardTitle className="sr-only">{BRAND_NAME}</CardTitle>
            <CardDescription>{t.auth.passwordRequirements}</CardDescription>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              {/* Explains why the user is here rather than on the dashboard:
                  without it, being bounced out of the app reads as a fault. */}
              {mustChangePassword && (
                <Alert variant="warning">{t.auth.mustChangePassword}</Alert>
              )}

              {errors.root && (
                <Alert variant="destructive">{errors.root.message}</Alert>
              )}

              <Field
                label={t.auth.currentPassword}
                htmlFor="currentPassword"
                required
                error={
                  errors.currentPassword
                    ? (errors.currentPassword.message ??
                      t.validation.passwordRequired)
                    : undefined
                }
              >
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  {...register("currentPassword")}
                />
              </Field>

              <Field
                label={t.auth.newPassword}
                htmlFor="newPassword"
                required
                error={
                  errors.newPassword
                    ? (errors.newPassword.message ??
                      t.auth.passwordRequirements)
                    : undefined
                }
              >
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("newPassword")}
                />
              </Field>

              <Field
                label={t.auth.confirmPassword}
                htmlFor="confirmPassword"
                required
                error={
                  errors.confirmPassword
                    ? t.auth.passwordsDoNotMatch
                    : undefined
                }
              >
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
              </Field>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                {t.auth.resetPassword}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
