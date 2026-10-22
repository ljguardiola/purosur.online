import { describe, expect, it } from "vitest";
import { creditNoteRow, voidedSaleNotice } from "./credit-note-text";

const AUTHORIZED = {
  kind: "authorized",
  point_of_sale: 4,
  number: 12,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;

describe("creditNoteRow", () => {
  it("names the point of sale and number of an authorized credit note", () => {
    expect(creditNoteRow(AUTHORIZED)).toEqual({
      label: "Nota de crédito C",
      value: "PV 00004 · Nº 00000012",
    });
  });

  it("says a credit note the tax authority has not answered yet is in progress", () => {
    expect(creditNoteRow({ kind: "in_progress" })).toEqual({
      label: "Nota de crédito C",
      value: "En trámite con ARCA",
    });
  });

  it.each([
    [{ kind: "rejected" } as const, "No emitida"],
    [{ kind: "already_credited" } as const, "No emitida: la factura ya tenía una"],
  ])("says a credit note that was not issued: %j", (creditNote, value) => {
    expect(creditNoteRow(creditNote)).toEqual({ label: "Nota de crédito C", value });
  });
});

describe("voidedSaleNotice", () => {
  it.each([null, AUTHORIZED])("only says the merchandise went back to stock: %j", (creditNote) => {
    expect(voidedSaleNotice(creditNote)).toEqual({
      tone: "success",
      title: "Venta anulada",
      description: "La mercadería volvió al stock.",
    });
  });

  it("says the credit note is printed from the history once it is known", () => {
    expect(voidedSaleNotice({ kind: "in_progress" })).toEqual({
      tone: "warning",
      title: "Venta anulada",
      description:
        "La nota de crédito quedó en trámite con ARCA. La imprimís desde el historial cuando esté.",
    });
  });

  it("says the tax authority rejected the credit note and who to tell", () => {
    expect(voidedSaleNotice({ kind: "rejected" })).toEqual({
      tone: "warning",
      title: "Venta anulada",
      description: "ARCA rechazó la nota de crédito. Avisá al Administrador.",
    });
  });

  it("says no other credit note was issued when the invoice already had one", () => {
    expect(voidedSaleNotice({ kind: "already_credited" })).toEqual({
      tone: "warning",
      title: "Venta anulada",
      description: "La factura ya tenía nota de crédito, así que no se emitió otra.",
    });
  });
});
