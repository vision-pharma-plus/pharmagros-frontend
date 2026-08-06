"use client";

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
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const t = useTranslation();
  const router = useRouter();
  const { login, status, error, clearError, mustChangePassword } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status !== "authenticated") return;
    // A forced password change takes precedence: the rest of the API is closed
    // to this session until it is done, so the dashboard would only render
    // errors.
    router.replace(mustChangePassword ? "/change-password" : "/dashboard");
  }, [status, mustChangePassword, router]);

  const onSubmit = async (values: FormValues) => {
    clearError();
    try {
      await login(values.email, values.password);
      // The effect above handles the redirect once the store settles, so the
      // destination is decided in one place rather than two.
    } catch {
      // The store holds the error code; nothing to do here.
    }
  };

  /**
   * Map the backend's error code to a translated message.
   *
   * Lockout (429) is reported distinctly from bad credentials: telling a user
   * "wrong password" when they are actually locked out sends them into a loop
   * of further failed attempts.
   */
  const errorMessage = (() => {
    if (!error) return null;
    if (error === "account_locked") return t.auth.accountLocked;
    if (error === "account_suspended") return t.auth.accountSuspended;
    if (error === "network_error") return t.errors.network_error;
    return t.auth.invalidCredentials;
  })();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Same height and control grouping as the app header, so signing in
          does not shift the theme and language controls around: both are
          "preferences", so they sit tight to each other. */}
      <header className="flex h-16 shrink-0 items-center justify-end px-4 lg:px-6">
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-24">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            {/* The wordmark stands in for the title here — rendering both put
                the logo's brand name and a text heading side by side. */}
            <Logo className="mb-3 h-14" priority />
            <CardTitle className="sr-only">{BRAND_NAME}</CardTitle>
            <CardDescription>{t.auth.signInSubtitle}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {errorMessage && <Alert variant="destructive">{errorMessage}</Alert>}

              <Field
                label={t.auth.email}
                htmlFor="email"
                required
                error={errors.email ? t.validation.emailInvalid : undefined}
              >
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  {...register("email")}
                />
              </Field>

              <Field
                label={t.auth.password}
                htmlFor="password"
                required
                error={
                  errors.password ? t.validation.passwordRequired : undefined
                }
              >
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register("password")}
                />
              </Field>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                {t.auth.signIn}
              </Button>

              {/* Password reset is handled by an administrator until the
                  self-service flow ships — pointing at a dead route left the
                  only recovery affordance on this screen broken. */}
              <p className="text-center text-sm text-muted-foreground">
                {t.auth.forgotPasswordContactAdmin}
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
