import { expect, test } from "vitest";
import { voucherKeyOf, voucherKeySchema, voucherOfKey } from "./issued-fiscal-document-voucher";

test("writes a voucher as its type, point of sale and number joined by dashes", () => {
  expect(voucherKeyOf({ voucher_type: 6, point_of_sale: 3, number: 123 })).toBe("6-3-123");
});

test("reads back the voucher a key names", () => {
  expect(voucherOfKey("6-3-123")).toEqual({ voucher_type: 6, point_of_sale: 3, number: 123 });
  expect(voucherOfKey(voucherKeyOf({ voucher_type: 11, point_of_sale: 12, number: 4500 }))).toEqual(
    {
      voucher_type: 11,
      point_of_sale: 12,
      number: 4500,
    },
  );
});

test.each([
  "6-3",
  "6-3-123-4",
  "a-3-123",
  "6--123",
  "6-3-0",
  "0-3-123",
  "6-3-1.5",
  "",
  "6-3-123456789",
])("refuses %j as a voucher key", (key) => {
  expect(voucherKeySchema.safeParse(key).success).toBe(false);
});

test("accepts a well-formed key", () => {
  expect(voucherKeySchema.safeParse("6-3-123").success).toBe(true);
});
