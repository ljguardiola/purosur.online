import { pendingPurchaseOrdersSchema, purchaseOrderSummarySchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const CREATED_AT_TIME_ZONE = schemaText(
  purchaseOrderSummarySchema.shape.createdAt.meta()?.["timeZone"],
);

const SENT_AT_TIME_ZONE = schemaText(
  pendingPurchaseOrdersSchema.shape.orders.element.shape.sent_at.meta()?.["timeZone"],
);

function formatOrderDay(instant: string, timeZone: string): string {
  return formatDate(new Date(instant), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
}

export function formatPurchaseOrderCreatedDay(createdAt: string): string {
  return formatOrderDay(createdAt, CREATED_AT_TIME_ZONE);
}

export function formatPurchaseOrderSentDay(sentAt: string): string {
  return formatOrderDay(sentAt, SENT_AT_TIME_ZONE);
}
