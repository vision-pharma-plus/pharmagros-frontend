"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

/**
 * The signed-in user's own account.
 *
 * The profile form is deliberately narrow — first/last name, phone, job title
 * and language — because those are the only fields `PATCH /auth/me/` accepts.
 * Roles and the active flag are administered from the users screen, never by
 * the account holder.
 */
export default function ProfilePage() {
  const t = useTranslation();
  const router = useRouter();
  const { user, logout, loadSession } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? "");
  const [language, setLanguage] = useState(user?.language ?? "fr");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<ApiError | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<ApiError | null>(null);

  if (!user) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {t.auth.sessionExpired}
      </Alert>
    );
  }

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    try {
      await api.patch<User>("/auth/me/", {
        first_name: firstName,
        last_name: lastName,
        phone,
        job_title: jobTitle,
        language,
      });
      // Refresh the store so the sidebar name and language follow immediately.
      await loadSession();
      toast.success(t.toasts.updated);
    } catch (caught) {
      setProfileError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const passwordsMatch = newPassword === confirmPassword;

  const changePassword = async () => {
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await api.post("/auth/password/change/", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(t.auth.passwordChanged, t.auth.sessionExpired);
      // The backend invalidates the session on a password change, so staying
      // on the page would leave the user with tokens that no longer work.
      await logout();
      router.replace("/login");
    } catch (caught) {
      setPasswordError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.admin.profile}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.generalInfo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileError && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(profileError, t)}
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.admin.firstName} required>
                <Input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </Field>
              <Field label={t.admin.lastName} required>
                <Input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </Field>
            </div>

            <Field label={t.partners.phone}>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>

            <Field label={t.admin.jobTitle}>
              <Input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </Field>

            <Field label={t.admin.language}>
              <Select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as "fr" | "en")
                }
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            </Field>

            <Button
              onClick={saveProfile}
              loading={savingProfile}
              disabled={!firstName.trim() || !lastName.trim()}
            >
              {t.common.save}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.changePassword}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordError && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(passwordError, t)}
              </Alert>
            )}

            <Alert>{t.auth.passwordRequirements}</Alert>

            <Field label={t.auth.currentPassword} required>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>

            <Field label={t.auth.newPassword} required>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>

            <Field
              label={t.auth.confirmPassword}
              required
              error={
                confirmPassword && !passwordsMatch
                  ? t.auth.passwordsDoNotMatch
                  : undefined
              }
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </Field>

            <Button
              onClick={changePassword}
              loading={savingPassword}
              disabled={
                !currentPassword ||
                !newPassword ||
                !passwordsMatch
              }
            >
              {t.admin.changePassword}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.sections.accessAndRoles}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y divide-border">
              <DetailRow
                label={t.admin.employeeCode}
                value={user.employee_code}
              />
              <DetailRow
                label={t.admin.lastLogin}
                value={
                  user.last_login ? formatDateTime(user.last_login) : "—"
                }
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-muted-foreground">
                {t.admin.roles}
              </p>
              {user.role_codes.length ? (
                <div className="flex flex-wrap gap-1">
                  {user.role_codes.map((code) => (
                    <Badge key={code} variant="secondary">
                      {code}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm">—</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
