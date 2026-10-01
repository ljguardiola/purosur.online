import { pointOfSaleConfigurationBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_REGISTER_POINT_OF_SALE_FORM,
  fiscalAddressMessage,
  pointOfSaleNumberMessage,
  registerPointOfSaleFormValuesFrom,
  registerPointOfSaleRequestFrom,
} from "./register-point-of-sale-form";

const configured = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 2,
};

test("fills the form with the register's number as typed, its fiscal address and its version", () => {
  expect(registerPointOfSaleFormValuesFrom(configured)).toEqual({
    pointOfSaleNumber: "12",
    fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    version: 2,
  });
});

test("fills the form empty for a register never configured", () => {
  expect(
    registerPointOfSaleFormValuesFrom({
      ...configured,
      pointOfSaleNumber: null,
      fiscalAddressId: null,
      version: 0,
    }),
  ).toEqual(EMPTY_REGISTER_POINT_OF_SALE_FORM);
});

test("builds the request with the typed number as a number, the chosen address and the version", () => {
  const request = registerPointOfSaleRequestFrom({
    pointOfSaleNumber: " 12 ",
    fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    version: 2,
  });

  expect(request).toEqual({
    point_of_sale_number: 12,
    fiscal_address_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    version: 2,
  });
  expect(pointOfSaleConfigurationBodySchema.safeParse(request).success).toBe(true);
});

test("builds a request the shape refuses for text that is not a number or an unchosen address", () => {
  const request = registerPointOfSaleRequestFrom({
    pointOfSaleNumber: "doce",
    fiscalAddressId: null,
    version: 0,
  });

  expect(request.fiscal_address_id).toBe("");
  expect(pointOfSaleConfigurationBodySchema.safeParse(request).success).toBe(false);
});

test.each(["1e1", "0x1F", "0b11", "+7", "12.0", "1,5", "-3"])(
  "builds a request the shape refuses for the typed text %s, which is not plain digits",
  (typed) => {
    const request = registerPointOfSaleRequestFrom({
      pointOfSaleNumber: typed,
      fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      version: 0,
    });

    expect(pointOfSaleConfigurationBodySchema.safeParse(request).success).toBe(false);
  },
);

test("asks for the point of sale when it is empty and to review it otherwise", () => {
  expect(pointOfSaleNumberMessage(EMPTY_REGISTER_POINT_OF_SALE_FORM)).toBe(
    "Ingresá el punto de venta.",
  );
  expect(
    pointOfSaleNumberMessage({ ...EMPTY_REGISTER_POINT_OF_SALE_FORM, pointOfSaleNumber: "doce" }),
  ).toBe("Revisá el punto de venta.");
});

test("asks to choose the fiscal address", () => {
  expect(fiscalAddressMessage()).toBe("Elegí el domicilio fiscal.");
});
