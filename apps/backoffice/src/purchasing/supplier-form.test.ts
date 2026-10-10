import {
  SUPPLIER_CONTACT_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTE_MAX_LENGTH,
} from "@purosur/domain";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import {
  supplierContactMessage,
  supplierCreationRequestFrom,
  supplierCuitMessage,
  supplierEditRequestFrom,
  supplierFormValuesOf,
  supplierNameMessage,
  supplierNoteMessage,
} from "./supplier-form";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

const values = { name: "", cuit: "", contact: "", note: "", version: 1 };

describe("supplierNameMessage", () => {
  it("asks for a name when it is blank or only spaces", () => {
    expect(supplierNameMessage({ ...values, name: "" })).toBe("Ingresá el nombre del proveedor.");
    expect(supplierNameMessage({ ...values, name: "   " })).toBe(
      "Ingresá el nombre del proveedor.",
    );
  });

  it("names the limit when the trimmed name is over it", () => {
    expect(supplierNameMessage({ ...values, name: "a".repeat(SUPPLIER_NAME_MAX_LENGTH + 1) })).toBe(
      `El nombre puede tener hasta ${SUPPLIER_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it("asks to review a name that passes every local check, trimmed before the limit applies", () => {
    const atTheLimit = `  ${"a".repeat(SUPPLIER_NAME_MAX_LENGTH)}  `;
    expect(supplierNameMessage({ ...values, name: atTheLimit })).toBe(
      "Revisá el nombre del proveedor.",
    );
  });
});

describe("supplierCuitMessage", () => {
  it("shows the format a CUIT is typed in", () => {
    expect(supplierCuitMessage({ ...values, cuit: "20123" })).toBe(
      "Ingresá un CUIT válido, con el formato NN-NNNNNNNN-N.",
    );
  });
});

describe("supplierContactMessage and supplierNoteMessage", () => {
  it("name the limit when the text is over it", () => {
    expect(
      supplierContactMessage({ ...values, contact: "a".repeat(SUPPLIER_CONTACT_MAX_LENGTH + 1) }),
    ).toBe(`El contacto puede tener hasta ${SUPPLIER_CONTACT_MAX_LENGTH} caracteres.`);
    expect(supplierNoteMessage({ ...values, note: "a".repeat(SUPPLIER_NOTE_MAX_LENGTH + 1) })).toBe(
      `La nota puede tener hasta ${SUPPLIER_NOTE_MAX_LENGTH} caracteres.`,
    );
  });

  it("ask to review text that is within the limit", () => {
    expect(supplierContactMessage({ ...values, contact: "Marta" })).toBe("Revisá el contacto.");
    expect(supplierNoteMessage({ ...values, note: "Entrega los martes" })).toBe("Revisá la nota.");
  });
});

describe("supplierCreationRequestFrom", () => {
  it("sends every field trimmed, without a version", () => {
    expect(
      supplierCreationRequestFrom({
        name: "  Granos del Valle ",
        cuit: ` ${FICTIONAL_CUIT} `,
        contact: " Marta ",
        note: " ",
        version: 7,
      }),
    ).toEqual({ name: "Granos del Valle", cuit: FICTIONAL_CUIT, contact: "Marta", note: "" });
  });
});

describe("supplierEditRequestFrom", () => {
  it("sends every field trimmed with the version it was loaded at", () => {
    expect(
      supplierEditRequestFrom({ name: " Andina ", cuit: "", contact: "", note: "", version: 3 }),
    ).toEqual({ name: "Andina", cuit: "", contact: "", note: "", version: 3 });
  });
});

describe("supplierFormValuesOf", () => {
  it("fills the form with the supplier's data, an unset text as empty", () => {
    expect(supplierFormValuesOf(andina)).toEqual({
      name: "Distribuidora Andina",
      cuit: FICTIONAL_CUIT,
      contact: "Marta Pérez · 11 5555-0100",
      note: "Entrega los martes",
      version: 1,
    });
    expect(supplierFormValuesOf(granos)).toEqual({
      name: "Granos del Valle",
      cuit: "",
      contact: "",
      note: "",
      version: 2,
    });
  });
});
