import { expect, test } from "vitest";
import {
  deferredSaleFormRequestSchema,
  deferredSaleRequestFrom,
  EMPTY_DEFERRED_SALE_FORM,
  INVALID_SHORT_CODE_MESSAGE,
  scannedDeferredSaleReading,
} from "./deferred-sale-form";

test("a typed code is looked up as typed", () => {
  expect(deferredSaleRequestFrom({ code: "7kq4-m2p9" })).toEqual({
    reading: { kind: "typed", code: "7kq4-m2p9" },
  });
});

test.each(["7KQ4M2P9", "7KQ4-M2P9", "7kq4 m2p9", "  7kq4-m2p9  "])(
  "the request's shape accepts the code %j",
  (code) => {
    expect(deferredSaleFormRequestSchema.safeParse(deferredSaleRequestFrom({ code })).success).toBe(
      true,
    );
  },
);

test.each(["", "7KQ4", "7KQ4-M2P0", "7KQ4-M2P9X"])(
  "the request's shape refuses the code %j",
  (code) => {
    expect(deferredSaleFormRequestSchema.safeParse(deferredSaleRequestFrom({ code })).success).toBe(
      false,
    );
  },
);

test("the form starts with no code", () => {
  expect(EMPTY_DEFERRED_SALE_FORM).toEqual({ code: "" });
});

test("a refused code is told how many characters it has and shown an example", () => {
  expect(INVALID_SHORT_CODE_MESSAGE).toBe("El código tiene 8 letras y números, como 7KQ4-M2P9.");
});

test("the text of a deferred sale's QR is looked up as scanned", () => {
  const text = "purosur-deferred-sale:0198-abc:7KQ4M2P9";

  expect(scannedDeferredSaleReading(text)).toEqual({ kind: "scanned", text });
});

test.each(["https://example.test/qr", "7790001", ""])(
  "the text %j is not a deferred sale's QR",
  (text) => {
    expect(scannedDeferredSaleReading(text)).toBeUndefined();
  },
);
