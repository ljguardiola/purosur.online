import { isBarcodeTooLong } from "@purosur/domain";
import { z } from "zod";

export const scannedCodeSchema = z
  .string()
  .min(1)
  .refine((code) => !isBarcodeTooLong(code));

const cents = z.int().nonnegative();

const saleLineSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  quantity: z.int().positive(),
  list_unit_price: cents,
  line_total: cents,
});

export const saleSchema = z.object({
  id: z.string(),
  lines: z.array(saleLineSchema),
  total: cents,
});
export type OpenSale = z.infer<typeof saleSchema>;
export type CurrentSaleAnswer = OpenSale | null | "not_permitted";

export const scanProductOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("added"), sale: saleSchema }),
  z.object({ kind: z.literal("unknown_code") }),
  z.object({ kind: z.literal("no_price"), product_name: z.string() }),
  z.object({ kind: z.literal("sold_by_weight"), product_name: z.string() }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("installation_revoked") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type ScanProductOutcome = z.infer<typeof scanProductOutcomeSchema>;
