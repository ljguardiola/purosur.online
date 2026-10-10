import { offlinePointOfSaleConfigurationBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_OFFLINE_POINT_OF_SALE_FORM,
  offlinePointOfSaleFormValuesFrom,
  offlinePointOfSaleRequestFrom,
} from "./register-offline-point-of-sale-form";

const configured = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 2,
  offlinePointOfSaleNumber: 13,
  offlineVersion: 5,
};

test("fills the offline form with the register's offline number as typed and its offline version", () => {
  expect(offlinePointOfSaleFormValuesFrom(configured)).toEqual({
    pointOfSaleNumber: "13",
    version: 5,
  });
});

test("fills the offline form empty for a register without an offline point of sale", () => {
  expect(
    offlinePointOfSaleFormValuesFrom({
      ...configured,
      offlinePointOfSaleNumber: null,
      offlineVersion: 0,
    }),
  ).toEqual(EMPTY_OFFLINE_POINT_OF_SALE_FORM);
});

test("builds the offline request with only the typed number and the version", () => {
  const request = offlinePointOfSaleRequestFrom({ pointOfSaleNumber: " 13 ", version: 5 });

  expect(request).toEqual({ point_of_sale_number: 13, version: 5 });
  expect(offlinePointOfSaleConfigurationBodySchema.safeParse(request).success).toBe(true);
});
