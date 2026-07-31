"use client";

import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
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
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(user.error, t)}
      </Alert>
    );
  }

  return <UserForm key={user.data.id} user={user.data} />;
}
