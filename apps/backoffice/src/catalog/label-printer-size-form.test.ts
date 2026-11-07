import { expect, test } from "vitest";
import {
  LABEL_PRINTER_SIZE_MESSAGES,
  LABEL_PRINTS_FIELDS,
  labelPrinterSizeFormValues,
  labelPrintsRequestFrom,
  printableLabelSize,
} from "./label-printer-size-form";

const labels = [{ productId: "product-1", count: 2 }];

test("fills the fields with a size's millimetres", () => {
  expect(labelPrinterSizeFormValues({ widthMm: 40, heightMm: 25 })).toEqual({
    widthMm: "40",
    heightMm: "25",
  });
});

test("builds the request with the chosen labels and the typed size in millimetres", () => {
  expect(labelPrintsRequestFrom({ widthMm: " 70 ", heightMm: "50" }, labels)).toEqual({
    labels,
    size: { widthMm: 70, heightMm: 50 },
  });
});

test.each(["50,5", "", "-30"])("sends no millimetres for a width typed as %j", (widthMm) => {
  expect(labelPrintsRequestFrom({ widthMm, heightMm: "30" }, labels).size.widthMm).toBeNaN();
});

test.each([
  ["size.widthMm", "widthMm"],
  ["size.heightMm", "heightMm"],
] as const)("lands a problem with %s on the %s field", (wireField, field) => {
  expect(LABEL_PRINTS_FIELDS[wireField]).toBe(field);
});

test("lands nothing on a field for a problem with the chosen labels", () => {
  expect(LABEL_PRINTS_FIELDS.labels).toBeNull();
});

test.each([
  [{ widthMm: "80", heightMm: "30" }, "widthMm"],
  [{ widthMm: "50", heightMm: "10" }, "heightMm"],
  [{ widthMm: "80", heightMm: "10" }, "widthMm"],
  [{ widthMm: "50", heightMm: "30" }, "widthMm"],
] as const)("lands a refused size typed as %j on the %s field", (values, field) => {
  expect(LABEL_PRINTS_FIELDS.size(values)).toBe(field);
});

test.each([
  ["50,5", "Ingresá el ancho en milímetros enteros, de 25 a 70 mm."],
  ["", "Ingresá el ancho en milímetros enteros, de 25 a 70 mm."],
  ["80", "El ancho va de 25 a 70 mm."],
  ["24", "El ancho va de 25 a 70 mm."],
  ["50", "Revisá el ancho."],
])("tells a width typed as %j: %s", (widthMm, message) => {
  expect(LABEL_PRINTER_SIZE_MESSAGES.widthMm({ widthMm, heightMm: "30" })).toBe(message);
});

test.each([
  ["15,5", "Ingresá el alto en milímetros enteros, de 15 a 70 mm."],
  ["", "Ingresá el alto en milímetros enteros, de 15 a 70 mm."],
  ["71", "El alto va de 15 a 70 mm."],
  ["10", "El alto va de 15 a 70 mm."],
  ["30", "Revisá el alto."],
])("tells a height typed as %j: %s", (heightMm, message) => {
  expect(LABEL_PRINTER_SIZE_MESSAGES.heightMm({ widthMm: "50", heightMm })).toBe(message);
});

test("reads a printable size from the fields", () => {
  expect(printableLabelSize({ widthMm: "25", heightMm: "70" })).toEqual({
    widthMm: 25,
    heightMm: 70,
  });
});

test.each([
  { widthMm: "80", heightMm: "30" },
  { widthMm: "50", heightMm: "14" },
  { widthMm: "50,5", heightMm: "30" },
  { widthMm: "50", heightMm: "" },
])("reads no printable size from fields holding %j", (values) => {
  expect(printableLabelSize(values)).toBeNull();
});
