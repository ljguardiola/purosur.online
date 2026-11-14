import { expect, test } from "vitest";
import { scannedDeferredSaleReading } from "./deferred-sale-form";

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
