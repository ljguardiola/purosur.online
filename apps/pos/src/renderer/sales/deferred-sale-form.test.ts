import { expect, test } from "vitest";
import {
  deferredSaleFormRequestSchema,
  deferredSaleRequestFrom,
  EMPTY_DEFERRED_SALE_FORM,
  INVALID_SHORT_CODE_MESSAGE,
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
