import {
  hasValidReceiptNumber,
  isCalendarDay,
  isCostPaid,
  isLotNumberTooLong,
  isPackageCount,
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

const CALENDAR_DAY_MESSAGE = "must be a calendar day in the form YYYY-MM-DD";
const PACKAGES_MESSAGE = "packages must be a positive whole number";
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

const packagingLineSchema = z.object({
  loadedBy: z.literal("packaging"),
  ...lineFields,
  packagingId: recordIdSchema("packagingId must be a packaging's id"),
  packages: z.number({ error: PACKAGES_MESSAGE }).refine(isPackageCount, PACKAGES_MESSAGE),
});

const quantityLineSchema = z.object({
  loadedBy: z.literal("quantity"),
  ...lineFields,
  quantity: z
    .number({ error: QUANTITY_MESSAGE })
    .refine(mayBeMovementQuantity, QUANTITY_MESSAGE)
    .meta({ decimals: STOCK_QUANTITY_DECIMALS, perUnit: STOCK_QUANTITY_PER_UNIT }),
});

export const purchaseRegistrationBodySchema = z
  .object({
    supplierId: recordIdSchema("supplierId must be a supplier's id"),
    purchasedOn: z
      .string({ error: `purchasedOn ${CALENDAR_DAY_MESSAGE}` })
      .refine(isCalendarDay, `purchasedOn ${CALENDAR_DAY_MESSAGE}`),
    receiptType: z.enum(RECEIPT_TYPES, {
      error: `receiptType must be one of ${RECEIPT_TYPES.join(", ")}`,
    }),
    receiptNumber: optionalLimitedTextSchema(
      "receiptNumber",
      RECEIPT_NUMBER_MAX_LENGTH,
      isReceiptNumberTooLong,
    ),
    note: optionalLimitedTextSchema("note", PURCHASE_NOTE_MAX_LENGTH, isPurchaseNoteTooLong),
    lines: z
      .array(z.discriminatedUnion("loadedBy", [packagingLineSchema, quantityLineSchema]))
      .min(MIN_PURCHASE_LINES),
  })
  .refine((body) => hasValidReceiptNumber(body.receiptType, body.receiptNumber), {
    path: ["receiptNumber"],
    error: RECEIPT_NUMBER_MESSAGE,
  });

export type PurchaseRegistrationBody = z.input<typeof purchaseRegistrationBodySchema>;
