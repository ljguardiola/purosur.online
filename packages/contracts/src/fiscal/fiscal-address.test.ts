import { describe, expect, it } from "vitest";
import { fiscalAddressListSchema, fiscalAddressSchema } from "./fiscal-address.js";

const fiscalAddress = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Depósito Central",
  street_address: "Calle Ficticia 123, CABA",
  version: 2,
};

describe("fiscalAddressSchema", () => {
  it("reads a fiscal address", () => {
    expect(fiscalAddressSchema.parse(fiscalAddress)).toEqual(fiscalAddress);
  });

  it.each(["id", "name", "street_address", "version"])("refuses one without its %s", (field) => {
    expect(fiscalAddressSchema.safeParse({ ...fiscalAddress, [field]: undefined }).success).toBe(
      false,
    );
  });

  it("refuses a fractional version", () => {
    expect(fiscalAddressSchema.safeParse({ ...fiscalAddress, version: 1.5 }).success).toBe(false);
  });
});

describe("fiscalAddressListSchema", () => {
  it("reads a list of fiscal addresses, empty or not", () => {
    expect(fiscalAddressListSchema.parse([])).toEqual([]);
    expect(fiscalAddressListSchema.parse([fiscalAddress])).toEqual([fiscalAddress]);
  });
});
