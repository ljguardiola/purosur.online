import { z } from "zod";

export const PURCHASE_REGISTERED_STATE = { purchaseRegistered: true };

const purchaseRegisteredStateSchema = z.object({ purchaseRegistered: z.literal(true) });

export function purchaseRegisteredIn(historyState: unknown): boolean {
  return purchaseRegisteredStateSchema.safeParse(historyState).success;
}
