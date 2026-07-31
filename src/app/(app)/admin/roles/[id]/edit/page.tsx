"use client";

import { useParams } from "next/navigation";

import { Alert, Skeleton } from "@/components/ui/primitives";
import {
  FormCardSkeleton,
  PermissionListCardSkeleton,
} from "@/components/ui/skeletons";
import type { Role } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

import { RoleForm } from "../../role-form";

export default function EditRolePage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const role = useQuery<Role>(`/auth/roles/${params.id}/`);

  if (role.loading) {
    // Mirrors RoleForm: identification fields beside the permission matrix.
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <FormCardSkeleton fields={4} />
          <PermissionListCardSkeleton />
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

  // A system role is enforced read-only server-side; saying so here avoids a
  // user filling in a form whose submit will always be rejected.
  if (role.data.is_system) {
    return (
      <Alert variant="warning" title={t.admin.systemRole}>
        {t.admin.systemRoleReadOnly}
      </Alert>
    );
  }

  return <RoleForm key={role.data.id} role={role.data} />;
}
