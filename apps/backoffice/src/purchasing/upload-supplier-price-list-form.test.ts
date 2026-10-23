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
    expect(
      uploadRequestFrom({ ...EMPTY_UPLOAD_FORM, supplierId: "supplier-1", file: pdf }),
    ).toEqual({ source: "PDF", supplierId: "supplier-1", fileName: "lista.pdf" });
  });

  test("leaves the supplier and the file name empty while nothing is chosen", () => {
    expect(uploadRequestFrom(EMPTY_UPLOAD_FORM)).toEqual({
      source: "PDF",
      supplierId: "",
      fileName: "",
    });
  });

  test("builds the body from the chosen supplier and the typed address when the list comes from a web page", () => {
    expect(
      uploadRequestFrom({
        supplierId: "supplier-1",
        source: "WEB_PAGE",
        file: pdf,
        url: "https://distribuidoradelsur.com.ar/precios",
      }),
    ).toEqual({
      source: "WEB_PAGE",
      supplierId: "supplier-1",
      url: "https://distribuidoradelsur.com.ar/precios",
    });
  });
});

test("starts without a supplier, a file or an address, set to load a PDF", () => {
  expect(EMPTY_UPLOAD_FORM).toEqual({ supplierId: null, source: "PDF", file: null, url: "" });
});

test("lands the refusals of the supplier, of the file name and of the address on their fields", () => {
  expect(UPLOAD_FIELDS).toEqual({
    supplierId: "supplierId",
    source: null,
    fileName: "file",
    url: "url",
  });
});

describe("UPLOAD_FIELD_MESSAGES", () => {
  test("asks for the supplier", () => {
    expect(UPLOAD_FIELD_MESSAGES.supplierId).toBe("Elegí el proveedor.");
  });

  test("asks for the file while none is chosen", () => {
    expect(UPLOAD_FIELD_MESSAGES.file(EMPTY_UPLOAD_FORM)).toBe("Elegí el archivo PDF de la lista.");
  });

  test("speaks of the file's name once a file is chosen", () => {
    expect(UPLOAD_FIELD_MESSAGES.file({ ...EMPTY_UPLOAD_FORM, file: pdf })).toBe(
      "El nombre del archivo es demasiado largo.",
    );
  });

  test("asks for the address while none is typed", () => {
    expect(UPLOAD_FIELD_MESSAGES.url(EMPTY_UPLOAD_FORM)).toBe("Escribí la dirección de la página.");
  });

  test("asks for a complete web address once something is typed", () => {
    expect(UPLOAD_FIELD_MESSAGES.url({ ...EMPTY_UPLOAD_FORM, url: "precios" })).toBe(
      "Escribí la dirección completa de la página, empezando con http:// o https://.",
    );
  });
});
