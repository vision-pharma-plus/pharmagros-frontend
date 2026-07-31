"use client";

import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
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
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(medicine.error, t)}
      </Alert>
    );
  }

  return <MedicineForm key={medicine.data.id} medicine={medicine.data} />;
}
