import { describe, expect, test } from "vitest";
import { supplierPriceListRowStatusOf } from "./supplier-price-list-row-status";

describe("supplierPriceListRowStatusOf", () => {
  test.each([
    ["new", "info", "Nuevo"],
    ["price_changed", "warning", "Cambió el precio"],
    ["description_changed", "warning", "Cambió la descripción"],
    ["unlinked", "warning", "Sin vincular"],
    ["vat_rate_missing", "warning", "Falta el IVA"],
    ["linked", "success", "Vinculado"],
    ["reviewed", "success", "Revisado"],
  ] as const)("shows %s as %s, labelled %s", (status, tone, label) => {
    expect(supplierPriceListRowStatusOf(status)).toEqual({ tone, label });
  });
});
