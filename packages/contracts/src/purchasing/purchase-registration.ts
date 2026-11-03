import {
  hasValidReceiptNumber,
  isCalendarDay,
  isCostPaid,
  isLotNumberTooLong,
  isPurchaseNoteTooLong,
  isReceiptNumberTooLong,
  LOT_NUMBER_MAX_LENGTH,
  MIN_PURCHASE_LINES,
  mayBeMovementQuantity,
  PURCHASE_NOTE_MAX_LENGTH,
  RECEIPT_NUMBER_MAX_LENGTH,
  RECEIPT_TYPES,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { optionalLimitedTextSchema, optionalTextSchema } from "./optional-text.js";
import { packageCountFields } from "./package-count-fields.js";

const CALENDAR_DAY_MESSAGE = "must be a calendar day in the form YYYY-MM-DD";
const QUANTITY_MESSAGE = "quantity must be a positive integer number of thousandths";
const COST_MESSAGE = "costPaidCents must be a whole number of cents, not negative";
const RECEIPT_NUMBER_MESSAGE =
  "receiptNumber is required with a receipt and must be empty without one";

const lineFields = {
  productId: recordIdSchema("productId must be a product's id"),
  costPaidCents: z.number({ error: COST_MESSAGE }).refine(isCostPaid, COST_MESSAGE),
  lotNumber: optionalLimitedTextSchema("lotNumber", LOT_NUMBER_MAX_LENGTH, isLotNumberTooLong),
  expiresOn: optionalTextSchema(`expiresOn ${CALENDAR_DAY_MESSAGE}`, isCalendarDay),
};

const packagesLineSchema = z.object({
  loadedBy: z.literal("packages"),
  ...lineFields,
  ...packageCountFields,
});

const quantityLineSchema = z.object({
  loadedBy: z.literal("quantity"),
  ...lineFields,
  quantity: z
    .number({ error: QUANTITY_MESSAGE })
    .refine(mayBeMovementQuantity, QUANTITY_MESSAGE)
    .meta({ decimals: STOCK_QUANTITY_DECIMALS, perUnit: STOCK_QUANTITY_PER_UNIT }),
});

export const purchaseLineBodySchema = z.discriminatedUnion("loadedBy", [
  packagesLineSchema,
  quantityLineSchema,
]);

export const purchaseHeaderFields = {
  purchasedOn: z.string({ error: `purchasedOn ${CALENDAR_DAY_MESSAGE}` }).refine(isCalendarDay),
  receiptType: z.enum(RECEIPT_TYPES, {
    error: `receiptType must be one of ${RECEIPT_TYPES.join(", ")}`,
  }),
  receiptNumber: optionalLimitedTextSchema(
    "receiptNumber",
    RECEIPT_NUMBER_MAX_LENGTH,
    isReceiptNumberTooLong,
  ),
  note: optionalLimitedTextSchema("note", PURCHASE_NOTE_MAX_LENGTH, isPurchaseNoteTooLong),
};

export function receiptNumberMatchesType(body: {
  receiptType: (typeof RECEIPT_TYPES)[number];
  receiptNumber: string | null;
}): boolean {
  return hasValidReceiptNumber(body.receiptType, body.receiptNumber);
}

export const receiptNumberIssue = { path: ["receiptNumber"], error: RECEIPT_NUMBER_MESSAGE };

export const purchaseRegistrationBodySchema = z
  .object({
    supplierId: recordIdSchema("supplierId must be a supplier's id"),
    ...purchaseHeaderFields,
    lines: z.array(purchaseLineBodySchema).min(MIN_PURCHASE_LINES),
  })
  .refine(receiptNumberMatchesType, receiptNumberIssue);

export type PurchaseRegistrationBody = z.input<typeof purchaseRegistrationBodySchema>;
