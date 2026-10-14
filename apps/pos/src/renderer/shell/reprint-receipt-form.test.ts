import { expect, test } from "vitest";
import {
  EMPTY_REPRINT_RECEIPT_FORM,
  invalidReasonMessage,
  reprintReceiptFormRequestSchema,
  reprintReceiptRequestFrom,
} from "./reprint-receipt-form";

test("a reprint is requested with its reason as typed", () => {
  const request = reprintReceiptRequestFrom({ reason: "  El cliente pidió otra copia  " });

  expect(request).toEqual({ reason: "  El cliente pidió otra copia  " });
  expect(reprintReceiptFormRequestSchema.safeParse(request).success).toBe(true);
});

test("an empty reason is left for the core to refuse, with the limit it states", () => {
  const request = reprintReceiptRequestFrom(EMPTY_REPRINT_RECEIPT_FORM);

  expect(reprintReceiptFormRequestSchema.safeParse(request).success).toBe(true);
  expect(invalidReasonMessage(200)).toBe("Escribí el motivo (hasta 200 caracteres).");
});

test("the request's shape refuses a reason that is not text", () => {
  expect(reprintReceiptFormRequestSchema.safeParse({ reason: 3 }).success).toBe(false);
});
