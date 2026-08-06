"use client";

import { useParams } from "next/navigation";

import { PageError } from "@/components/ui/primitives";
import { FormPageSkeleton } from "@/components/ui/skeletons";
import type { Medicine } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

import { MedicineForm } from "../../medicine-form";

export default function EditMedicinePage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const medicine = useQuery<Medicine>(`/catalog/medicines/${params.id}/`);

  if (medicine.loading) {
    // Mirrors MedicineForm: identification, pricing, stock, regulatory.
    return <FormPageSkeleton cards={[9, 4, 4, 3]} />;
  }

  if (medicine.error || !medicine.data) {
    return (
      <PageError
        error={medicine.error}
        message={translateError(medicine.error, t)}
        onRetry={medicine.refetch}
        title={t.common.errorOccurred}
        retryLabel={t.common.retry}
        deniedTitle={t.common.accessDeniedTitle}
        deniedBody={t.common.accessDeniedBody}
        notFoundMessage={t.errors.not_found}
      />
    );
  }

  return <MedicineForm key={medicine.data.id} medicine={medicine.data} />;
}
