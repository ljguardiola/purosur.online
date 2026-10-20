import { describe, expect, test } from "vitest";
import { supplierPriceListStatusOf } from "./supplier-price-list-status";
import {
  DISCARDED_LIST,
  FAILED_LIST,
  READ_LIST,
  READING_LIST,
  REPLACED_LIST,
  REVIEWED_LIST,
} from "./test-support/supplier-price-lists";

describe("supplierPriceListStatusOf", () => {
  test("says how many items an extracted list has to review", () => {
    expect(supplierPriceListStatusOf(READ_LIST)).toEqual({
      tone: "warning",
      label: "14 ítems para revisar",
      busy: false,
    });
    expect(supplierPriceListStatusOf({ ...READ_LIST, rowCount: 1 }).label).toBe(
      "1 ítem para revisar",
    );
  });

  test("shows a list being read as busy", () => {
    expect(supplierPriceListStatusOf(READING_LIST)).toEqual({
      tone: "info",
      label: "Leyendo la lista",
      busy: true,
    });
  });

  test("calls a confirmed list reviewed, and a confirmed list a newer one replaced replaced", () => {
    expect(supplierPriceListStatusOf(REVIEWED_LIST)).toEqual({
      tone: "success",
      label: "Revisada",
      busy: false,
    });
    expect(supplierPriceListStatusOf(REPLACED_LIST)).toEqual({
      tone: "neutral",
      label: "Reemplazada",
      busy: false,
    });
  });

  test("calls a discarded list discarded", () => {
    expect(supplierPriceListStatusOf(DISCARDED_LIST)).toEqual({
      tone: "neutral",
      label: "Descartada",
      busy: false,
    });
  });

  test.each([
    ["unreadable_document", "No se pudo leer el contenido del archivo."],
    ["no_items_found", "No se encontró ningún ítem en el archivo."],
    ["reading_unavailable", "La lectura no estuvo disponible."],
    ["interrupted", "La lectura se interrumpió."],
  ] as const)("gives a list that could not be read for %s its reason", (readFailure, reason) => {
    expect(supplierPriceListStatusOf({ ...FAILED_LIST, readFailure })).toEqual({
      tone: "error",
      label: "No se pudo leer",
      busy: false,
      reason,
    });
  });
});
