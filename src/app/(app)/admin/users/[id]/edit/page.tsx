"use client";

import { useParams } from "next/navigation";

import { PageError } from "@/components/ui/primitives";
import { FormPageSkeleton } from "@/components/ui/skeletons";
import type { User } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

import { UserForm } from "../../user-form";

export default function EditUserPage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const user = useQuery<User>(`/auth/users/${params.id}/`);

  if (user.loading) {
    // Mirrors UserForm: identification, then access and roles.
    return <FormPageSkeleton cards={[6, 3]} />;
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

  return <UserForm key={user.data.id} user={user.data} />;
}
