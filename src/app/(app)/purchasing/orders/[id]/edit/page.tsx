"use client";

import { useParams } from "next/navigation";

import { OrderForm } from "@/app/(app)/purchasing/orders/order-form";
import {
  Alert,
  PageError,
} from "@/components/ui/primitives";
import { FormPageSkeleton } from "@/components/ui/skeletons";
import type { PurchaseOrder } from "@/lib/api/types";
import { translateError, useQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

export default function EditPurchaseOrderPage() {
  const t = useTranslation();
  const params = useParams<{ id: string }>();
  const order = useQuery<PurchaseOrder>(`/purchasing/orders/${params.id}/`);

  if (order.loading) {
    // Mirrors OrderForm: supplier, lines, landed costs, notes.
    return <FormPageSkeleton cards={[4, 6, 4, 2]} />;
  }

  if (order.error || !order.data) {
    return (
      <PageError
        error={order.error}
        message={translateError(order.error, t)}
        onRetry={order.refetch}
        title={t.common.errorOccurred}
        retryLabel={t.common.retry}
        deniedTitle={t.common.accessDeniedTitle}
        deniedBody={t.common.accessDeniedBody}
        notFoundMessage={t.errors.not_found}
      />
    );
  }

  // The service refuses this too; saying so here means the user is told before
  // filling in a form that cannot be saved, rather than after.
  if (!order.data.is_editable) {
    return (
      <Alert variant="warning" title={t.purchasing.editOrder}>
        {t.purchasing.draftOnlyEditable}
      </Alert>
    );
  }

  return <OrderForm key={order.data.id} order={order.data} />;
}
