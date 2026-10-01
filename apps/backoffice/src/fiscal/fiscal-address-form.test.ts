import { fiscalAddressCreationBodySchema, fiscalAddressEditBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_FISCAL_ADDRESS_FORM,
  fiscalAddressCreationRequestFrom,
  fiscalAddressEditRequestFrom,
  fiscalAddressFormValuesFrom,
  fiscalAddressNameMessage,
  fiscalAddressStreetAddressMessage,
} from "./fiscal-address-form";

const depot = {
  id: "address-1",
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  version: 3,
};

test("fills the form with the address's values and version", () => {
  expect(fiscalAddressFormValuesFrom(depot)).toEqual({
    name: "Depósito Central",
    streetAddress: "Calle Ficticia 123, CABA",
    version: 3,
  });
});

test("builds the creation request from the trimmed values, without a version", () => {
  const request = fiscalAddressCreationRequestFrom({
    name: "  Depósito Central ",
    streetAddress: " Calle Ficticia 123, CABA  ",
    version: 0,
  });

  expect(request).toEqual({ name: "Depósito Central", street_address: "Calle Ficticia 123, CABA" });
  expect(fiscalAddressCreationBodySchema.safeParse(request).success).toBe(true);
});

test("builds the edit request from the trimmed values and the version loaded", () => {
  const request = fiscalAddressEditRequestFrom({
    name: " Depósito Central ",
    streetAddress: " Calle Ficticia 123, CABA ",
    version: 3,
  });

  expect(request).toEqual({
    name: "Depósito Central",
    street_address: "Calle Ficticia 123, CABA",
    version: 3,
  });
  expect(fiscalAddressEditBodySchema.safeParse(request).success).toBe(true);
});

test("asks for the name when it is empty and says it is too long otherwise", () => {
  expect(fiscalAddressNameMessage(EMPTY_FISCAL_ADDRESS_FORM)).toBe(
    "Ingresá el nombre del domicilio fiscal.",
  );
  expect(fiscalAddressNameMessage({ ...EMPTY_FISCAL_ADDRESS_FORM, name: "   " })).toBe(
    "Ingresá el nombre del domicilio fiscal.",
  );
  expect(fiscalAddressNameMessage({ ...EMPTY_FISCAL_ADDRESS_FORM, name: "a".repeat(500) })).toBe(
    "Ese nombre es demasiado largo.",
  );
});

test("asks for the address when it is empty and says it is too long otherwise", () => {
  expect(fiscalAddressStreetAddressMessage(EMPTY_FISCAL_ADDRESS_FORM)).toBe(
    "Ingresá la dirección del domicilio fiscal.",
  );
  expect(
    fiscalAddressStreetAddressMessage({
      ...EMPTY_FISCAL_ADDRESS_FORM,
      streetAddress: "a".repeat(500),
    }),
  ).toBe("Esa dirección es demasiado larga.");
});
