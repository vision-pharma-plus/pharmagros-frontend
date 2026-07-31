"use client";

import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import { FormPageSkeleton } from "@/components/ui/skeletons";
import type { Supplier } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

import { SupplierForm } from "../../supplier-form";

export default function EditSupplierPage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const supplier = useQuery<Supplier>(`/partners/suppliers/${params.id}/`);

  if (supplier.loading) {
    // Mirrors SupplierForm: identification, contact, terms, banking.
    return <FormPageSkeleton cards={[3, 6, 4, 3]} />;
  }

  if (supplier.error || !supplier.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(supplier.error, t)}
      </Alert>
    );
  }

  // Keyed on the loaded record so react-hook-form's defaultValues are taken
  // from real data rather than from an empty first render.
  return <SupplierForm key={supplier.data.id} supplier={supplier.data} />;
}
