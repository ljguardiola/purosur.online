import { describe, expect, test } from "vitest";
import {
  EMPTY_UPLOAD_FORM,
  UPLOAD_FIELD_MESSAGES,
  UPLOAD_FIELDS,
  uploadRequestFrom,
} from "./upload-supplier-price-list-form";

const pdf = new File(["%PDF-1.7"], "lista.pdf", { type: "application/pdf" });

describe("uploadRequestFrom", () => {
  test("builds the query from the chosen supplier and the chosen file's name", () => {
    expect(uploadRequestFrom({ supplierId: "supplier-1", file: pdf })).toEqual({
      supplierId: "supplier-1",
      fileName: "lista.pdf",
    });
  });

  test("leaves the supplier and the file name empty while nothing is chosen", () => {
    expect(uploadRequestFrom(EMPTY_UPLOAD_FORM)).toEqual({ supplierId: "", fileName: "" });
  });
});

test("starts without a supplier or a file", () => {
  expect(EMPTY_UPLOAD_FORM).toEqual({ supplierId: null, file: null });
});

test("lands the refusals of the supplier and of the file name on their fields", () => {
  expect(UPLOAD_FIELDS).toEqual({ supplierId: "supplierId", fileName: "file" });
});

describe("UPLOAD_FIELD_MESSAGES", () => {
  test("asks for the supplier", () => {
    expect(UPLOAD_FIELD_MESSAGES.supplierId).toBe("Elegí el proveedor.");
  });

  test("asks for the file while none is chosen", () => {
    expect(UPLOAD_FIELD_MESSAGES.file(EMPTY_UPLOAD_FORM)).toBe("Elegí el archivo PDF de la lista.");
  });

  test("speaks of the file's name once a file is chosen", () => {
    expect(UPLOAD_FIELD_MESSAGES.file({ supplierId: null, file: pdf })).toBe(
      "El nombre del archivo es demasiado largo.",
    );
  });
});
