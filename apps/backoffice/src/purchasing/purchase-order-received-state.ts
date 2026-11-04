import { z } from "zod";

export const PURCHASE_ORDER_RECEIVED_STATE = { purchaseOrderReceived: true };

const purchaseOrderReceivedStateSchema = z.object({ purchaseOrderReceived: z.literal(true) });

export function purchaseOrderReceivedIn(historyState: unknown): boolean {
  return purchaseOrderReceivedStateSchema.safeParse(historyState).success;
}
