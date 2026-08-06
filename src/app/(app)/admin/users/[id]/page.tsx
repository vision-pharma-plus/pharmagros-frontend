"use client";

import { ArrowLeft, KeyRound, Pencil, ShieldOff, UserCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordChecklist } from "@/components/password-checklist";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageError,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/primitives";
import {
  DetailCardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { User, UserSession } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { isPasswordValid } from "@/lib/password-policy";
import { useAuth } from "@/lib/stores/auth";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

type DialogMode = "reset" | "suspend" | "revoke" | null;

export default function UserDetailPage() {
  const t = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const user = useQuery<User>(`/auth/users/${params.id}/`);
  const sessions = useQuery<UserSession[]>(`/auth/users/${params.id}/sessions/`);

  const [mode, setMode] = useState<DialogMode>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const openDialog = (next: DialogMode) => {
    setPassword("");
    setError(null);
    setMode(next);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (mode === "reset") {
        await api.post(`/auth/users/${params.id}/reset-password/`, {
          new_password: password,
        });
        toast.success(t.toasts.passwordReset, t.admin.temporaryPasswordHint);
      } else if (mode === "suspend") {
        const suspend = !user.data?.is_suspended;
        await api.post(`/auth/users/${params.id}/suspend/`, { suspend });
        toast.success(
          suspend ? t.toasts.userSuspended : t.toasts.userReactivated,
        );
      } else if (mode === "revoke") {
        await api.post(`/auth/users/${params.id}/revoke-sessions/`);
        toast.success(t.toasts.sessionsRevoked);
      }
      setMode(null);
      user.refetch();
      sessions.refetch();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, { code: "unknown_error", message: String(caught) }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (user.loading) {
    // Identification rows beside the roles/permissions card, then the
    // full-width sessions table.
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton back badges={1} actions={3} />
        <div className="grid gap-5 lg:grid-cols-2">
          <DetailCardSkeleton rows={5} />
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-36" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Skeleton className="mb-1.5 h-3.5 w-20" />
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-5 w-24 rounded-full" />
                  ))}
                </div>
              </div>
              <div>
                <Skeleton className="mb-1.5 h-3.5 w-24" />
                <Skeleton className="h-4 w-8" />
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <TableSkeleton columns={3} rows={3} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (user.error || !user.data) {
    return (
      <PageError
        error={user.error}
        message={translateError(user.error, t)}
        onRetry={user.refetch}
        title={t.common.errorOccurred}
        retryLabel={t.common.retry}
        deniedTitle={t.common.accessDeniedTitle}
        deniedBody={t.common.accessDeniedBody}
        notFoundMessage={t.errors.not_found}
      />
    );
  }

  const item = user.data;
  const activeSessions = (sessions.data ?? []).filter(
    (session) => session.is_active,
  );

  const dialogTitle =
    mode === "reset"
      ? t.admin.resetPassword
      : mode === "revoke"
        ? t.admin.revokeSessions
        : item.is_suspended
          ? t.admin.reactivateUser
          : t.admin.suspendUser;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 text-muted-foreground"
            onClick={() => router.push("/admin/users")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t.nav.users}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{item.full_name}</h1>
            {item.is_suspended ? (
              <Badge variant="destructive">{t.admin.suspended}</Badge>
            ) : (
              <Badge variant={item.is_active ? "success" : "secondary"}>
                {item.is_active ? t.admin.active : t.status.INACTIVE}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{item.email}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {can("accounts.change_user") && (
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/users/${params.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              {t.common.edit}
            </Button>
          )}
          {can("accounts.reset_user_password") && (
            <Button variant="outline" onClick={() => openDialog("reset")}>
              <KeyRound className="h-4 w-4" />
              {t.admin.resetPassword}
            </Button>
          )}
          {can("accounts.deactivate_user") && (
            <Button
              variant={item.is_suspended ? "outline" : "destructive"}
              onClick={() => openDialog("suspend")}
            >
              {item.is_suspended ? (
                <UserCheck className="h-4 w-4" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              {item.is_suspended ? t.admin.reactivateUser : t.admin.suspendUser}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.identification}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label={t.admin.employeeCode} value={item.employee_code} />
            <DetailRow label={t.admin.jobTitle} value={item.job_title} />
            <DetailRow label={t.partners.phone} value={item.phone} />
            <DetailRow
              label={t.admin.language}
              value={item.language === "fr" ? "Français" : "English"}
            />
            <DetailRow
              label={t.admin.lastLogin}
              value={item.last_login ? formatDateTime(item.last_login) : "—"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.sections.accessAndRoles}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1.5 text-sm text-muted-foreground">
                {t.admin.roles}
              </p>
              {item.role_codes.length ? (
                <div className="flex flex-wrap gap-1">
                  {item.role_codes.map((code) => (
                    <Badge key={code} variant="secondary">
                      {code}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm">—</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-sm text-muted-foreground">
                {t.admin.permissions}
              </p>
              {/* Effective permissions, inheritance included — this is what
                  the server will actually enforce for this account. */}
              <p className="text-sm font-medium">{item.permissions.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t.admin.sessions}</CardTitle>
            {can("accounts.revoke_sessions") && activeSessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDialog("revoke")}
              >
                {t.admin.revokeSessions}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {sessions.loading ? (
              <TableSkeleton columns={3} rows={3} />
            ) : activeSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t.admin.noSessions}
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t.admin.ipAddress}</TH>
                    <TH>{t.admin.device}</TH>
                    <TH>{t.admin.lastSeen}</TH>
                  </TR>
                </THead>
                <TBody>
                  {activeSessions.map((session) => (
                    <TR key={session.id}>
                      <TD className="font-mono text-xs">
                        {session.ip_address ?? "—"}
                      </TD>
                      <TD className="max-w-xs truncate text-muted-foreground">
                        {session.user_agent || "—"}
                      </TD>
                      <TD>{formatDateTime(session.last_seen_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <Alert variant="destructive" title={t.common.errorOccurred}>
                {translateError(error, t)}
              </Alert>
            )}

            {mode === "reset" && (
              <>
                <Alert>{t.admin.temporaryPasswordHint}</Alert>
                <Field label={t.admin.temporaryPassword} required>
                  <Input
                    type="text"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <PasswordChecklist value={password} />
              </>
            )}

            {mode === "suspend" && !item.is_suspended && (
              <Alert variant="warning">{t.admin.deactivateUserConfirm}</Alert>
            )}

            {mode === "revoke" && (
              <p className="text-sm">
                {activeSessions.length} {t.admin.sessions.toLowerCase()}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={submit}
              loading={saving}
              disabled={mode === "reset" && !isPasswordValid(password)}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
