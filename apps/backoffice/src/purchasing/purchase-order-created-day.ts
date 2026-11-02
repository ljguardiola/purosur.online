import { purchaseOrderSummarySchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const CREATED_AT_TIME_ZONE = schemaText(
  purchaseOrderSummarySchema.shape.createdAt.meta()?.["timeZone"],
);

export function formatPurchaseOrderCreatedDay(createdAt: string): string {
  return formatDate(new Date(createdAt), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: CREATED_AT_TIME_ZONE,
  });
}
