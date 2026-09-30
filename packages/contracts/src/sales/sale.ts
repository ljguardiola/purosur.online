import {
  isBarcodeTooLong,
  isProductNameTooLong,
  SALE_UNITS,
  SEARCH_RESULT_LIMIT,
} from "@purosur/domain";
import { z } from "zod";

export { SEARCH_RESULT_LIMIT };

export const scannedCodeSchema = z
  .string()
  .min(1)
  .refine((code) => !isBarcodeTooLong(code));

export const searchQuerySchema = z.string().refine((query) => !isProductNameTooLong(query));

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

const addedOutcome = z.object({ kind: z.literal("added"), sale: saleSchema });
const noPriceOutcome = z.object({ kind: z.literal("no_price"), product_name: z.string() });
const soldByWeightOutcome = z.object({
  kind: z.literal("sold_by_weight"),
  product_name: z.string(),
});
const notPermittedOutcome = z.object({ kind: z.literal("not_permitted") });
const notSignedInOutcome = z.object({ kind: z.literal("not_signed_in") });
const noOpenSessionOutcome = z.object({ kind: z.literal("no_open_session") });
const installationRevokedOutcome = z.object({ kind: z.literal("installation_revoked") });
const unavailableOutcome = z.object({ kind: z.literal("unavailable") });

export const scanProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("unknown_code") }),
  noPriceOutcome,
  soldByWeightOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  unavailableOutcome,
]);
export type ScanProductOutcome = z.infer<typeof scanProductOutcomeSchema>;

export const addProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("product_unavailable") }),
  noPriceOutcome,
  soldByWeightOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  unavailableOutcome,
]);
export type AddProductOutcome = z.infer<typeof addProductOutcomeSchema>;

const foundProductSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  unit_price: cents.nullable(),
  matches: z.array(z.object({ start: z.int().nonnegative(), length: z.int().positive() })),
});
export type FoundProduct = z.infer<typeof foundProductSchema>;

export const searchProductsOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("results"),
    products: z.array(foundProductSchema).max(SEARCH_RESULT_LIMIT),
    more: z.boolean(),
  }),
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  unavailableOutcome,
]);
export type SearchProductsOutcome = z.infer<typeof searchProductsOutcomeSchema>;
