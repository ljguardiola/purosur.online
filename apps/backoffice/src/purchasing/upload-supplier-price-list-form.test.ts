import { describe, expect, test } from "vitest";
import {
  EMPTY_UPLOAD_FORM,
  UPLOAD_FIELD_MESSAGES,
  UPLOAD_FIELDS,
  uploadRequestFrom,
  uploadRequestSchema,
} from "./upload-supplier-price-list-form";

const pdf = new File(["%PDF-1.7"], "lista.pdf", { type: "application/pdf" });

describe("uploadRequestSchema", () => {
  test("accepts a chosen supplier and a chosen file", () => {
    expect(
      uploadRequestSchema.safeParse(uploadRequestFrom({ supplierId: "supplier-1", file: pdf }))
        .success,
    ).toBe(true);
  });

  test("refuses a missing supplier or a missing file", () => {
    expect(
      uploadRequestSchema.safeParse(uploadRequestFrom({ supplierId: null, file: pdf })).success,
    ).toBe(false);
    expect(
      uploadRequestSchema.safeParse(uploadRequestFrom({ supplierId: "supplier-1", file: null }))
        .success,
    ).toBe(false);
  });
});

test("starts without a supplier or a file", () => {
  expect(EMPTY_UPLOAD_FORM).toEqual({ supplierId: null, file: null });
});

test("lands the refusals on the supplier and the file fields, the file name included", () => {
  expect(UPLOAD_FIELDS).toEqual({ supplierId: "supplierId", file: "file", fileName: "file" });
  expect(UPLOAD_FIELD_MESSAGES.supplierId(EMPTY_UPLOAD_FORM)).toBe("Elegí el proveedor.");
  expect(UPLOAD_FIELD_MESSAGES.file(EMPTY_UPLOAD_FORM)).toBe("Elegí el archivo PDF de la lista.");
});
