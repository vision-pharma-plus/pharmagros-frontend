"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/primitives";
import {
  DetailCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";
import type { Role } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
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

export default function RoleDetailPage() {
  const t = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const can = useAuth((state) => state.can);

  const role = useQuery<Role>(`/auth/roles/${params.id}/`);

  if (role.loading) {
    // General info rows beside the permission-code chips.
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton back badges={1} actions={1} />
        <div className="grid gap-5 lg:grid-cols-2">
          <DetailCardSkeleton rows={4} />
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-36" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 18 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-5 rounded-full"
                    // Permission codes vary in length; a uniform chip width
                    // reads as a grid rather than as a list of labels.
                    style={{ width: `${5 + ((index * 3) % 5)}rem` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (role.error || !role.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(role.error, t)}
      </Alert>
    );
  }

  const item = role.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 text-muted-foreground"
            onClick={() => router.push("/admin/roles")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t.nav.roles}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{item.name}</h1>
            {item.is_system && (
              <Badge variant="secondary">{t.admin.systemRole}</Badge>
            )}
            <Badge variant={item.is_active ? "success" : "secondary"}>
              {item.is_active ? t.admin.active : t.status.INACTIVE}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">{item.code}</p>
        </div>

        {can("accounts.manage_roles") && !item.is_system && (
          <Button
            variant="outline"
            onClick={() => router.push(`/admin/roles/${params.id}/edit`)}
          >
            <Pencil className="h-4 w-4" />
            {t.common.edit}
          </Button>
        )}
      </div>

      {item.is_system && (
        <Alert variant="warning">{t.admin.systemRoleReadOnly}</Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.generalInfo}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label={t.catalog.name} value={item.name} />
            <DetailRow label={t.admin.userCount} value={item.user_count} />
            <DetailRow label={t.catalog.description} value={item.description} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t.admin.permissions} ({item.permission_codes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Effective permissions, so anything gained through inheritance
                is listed here too rather than being invisible. */}
            {item.permission_codes.length ? (
              <div className="flex max-h-96 flex-wrap gap-1 overflow-y-auto">
                {item.permission_codes.map((code) => (
                  <Badge key={code} variant="secondary" className="font-mono">
                    {code}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.common.none}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
