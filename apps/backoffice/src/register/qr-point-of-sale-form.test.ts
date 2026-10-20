import { qrPointOfSaleAssignmentBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_QR_POINT_OF_SALE_FORM,
  qrPointOfSaleFormValuesFrom,
  qrPointOfSaleMessage,
  qrPointOfSaleRequestFrom,
} from "./qr-point-of-sale-form";

test("fills the form with the register's QR point of sale and the version of its assignment", () => {
  expect(
    qrPointOfSaleFormValuesFrom({ qrExternalPosId: "CAJA1_STORE_POS", qrPointOfSaleVersion: 2 }),
  ).toEqual({ externalPosId: "CAJA1_STORE_POS", version: 2 });
});

test("fills the form empty for a register without a QR point of sale", () => {
  expect(
    qrPointOfSaleFormValuesFrom({ qrExternalPosId: null, qrPointOfSaleVersion: 0 }),
  ).toEqual(EMPTY_QR_POINT_OF_SALE_FORM);
});

test("builds the request with the typed code and the version", () => {
  const request = qrPointOfSaleRequestFrom({ externalPosId: " CAJA1_STORE_POS ", version: 2 });

  expect(request).toEqual({ external_pos_id: "CAJA1_STORE_POS", version: 2 });
  expect(qrPointOfSaleAssignmentBodySchema.safeParse(request).success).toBe(true);
});

test("a typed code with spaces or nothing typed is refused by the request's shape", () => {
  expect(
    qrPointOfSaleAssignmentBodySchema.safeParse(
      qrPointOfSaleRequestFrom({ externalPosId: "CAJA 1", version: 0 }),
    ).success,
  ).toBe(false);
  expect(
    qrPointOfSaleAssignmentBodySchema.safeParse(
      qrPointOfSaleRequestFrom({ externalPosId: "  ", version: 0 }),
    ).success,
  ).toBe(false);
});

test("asks for the code when nothing is typed", () => {
  expect(qrPointOfSaleMessage({ externalPosId: "  " })).toBe("Ingresá el código de la caja QR.");
});

test("asks to remove the spaces from a typed code", () => {
  expect(qrPointOfSaleMessage({ externalPosId: "CAJA 1" })).toBe(
    "El código de la caja QR no puede tener espacios.",
  );
});
