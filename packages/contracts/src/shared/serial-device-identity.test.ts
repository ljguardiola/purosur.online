import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { serialDeviceIdentitySchema } from "./serial-device-identity.js";

describe("serialDeviceIdentitySchema", () => {
  it.each([
    { vendor_id: "0403", product_id: "6001" },
    { vendor_id: "05e0", product_id: "1200" },
    { vendor_id: "ffff", product_id: "0000" },
  ])("accepts %j", (identity) => {
    expect(serialDeviceIdentitySchema.parse(identity)).toEqual(identity);
  });

  it("accepts any pair of four lowercase hex digits", () => {
    const hex4 = fc.stringMatching(/^[0-9a-f]{4}$/);

    fc.assert(
      fc.property(hex4, hex4, (vendorId, productId) => {
        expect(
          serialDeviceIdentitySchema.safeParse({ vendor_id: vendorId, product_id: productId })
            .success,
        ).toBe(true);
      }),
    );
  });

  it.each([
    ["uppercase digits", { vendor_id: "05E0", product_id: "1200" }],
    ["a short vendor", { vendor_id: "403", product_id: "6001" }],
    ["a short product", { vendor_id: "0403", product_id: "601" }],
    ["a long vendor", { vendor_id: "00403", product_id: "6001" }],
    ["a long product", { vendor_id: "0403", product_id: "60010" }],
    ["a prefixed vendor", { vendor_id: "0x03", product_id: "6001" }],
    ["a non-hex product", { vendor_id: "0403", product_id: "60g1" }],
    ["a vendor with a trailing newline", { vendor_id: "0403\n", product_id: "6001" }],
    ["a padded product", { vendor_id: "0403", product_id: " 601" }],
    ["an empty vendor", { vendor_id: "", product_id: "6001" }],
    ["a numeric vendor", { vendor_id: 1027, product_id: "6001" }],
    ["no vendor", { product_id: "6001" }],
    ["no product", { vendor_id: "0403" }],
  ])("rejects %s", (_name, identity) => {
    expect(serialDeviceIdentitySchema.safeParse(identity).success).toBe(false);
  });
});
