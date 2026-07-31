"use client";

import { useParams } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import { FormPageSkeleton } from "@/components/ui/skeletons";
import type { Customer } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

import { CustomerForm } from "../../customer-form";

export default function EditCustomerPage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const customer = useQuery<Customer>(`/partners/customers/${params.id}/`);

  if (customer.loading) {
    // Mirrors CustomerForm: business, contact, licence, credit.
    return <FormPageSkeleton cards={[5, 6, 2, 4]} />;
  }

  if (customer.error || !customer.data) {
    return (
      <Alert variant="destructive" title={t.common.errorOccurred}>
        {translateError(customer.error, t)}
      </Alert>
    );
  }

  return <CustomerForm key={customer.data.id} customer={customer.data} />;
}
