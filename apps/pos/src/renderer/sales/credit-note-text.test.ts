import { describe, expect, it } from "vitest";
import {
  creditNotePrintButton,
  creditNoteRow,
  creditNoteRowOf,
  voidedSaleNotice,
} from "./credit-note-text";

const AUTHORIZED = {
  kind: "authorized",
  point_of_sale: 4,
  number: 12,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;

const ISSUED_OFFLINE = {
  kind: "issued_offline",
  point_of_sale: 9,
  number: 41,
  issued_on: "2026-10-09",
  offline_authorization_code: "71234567890123",
  fortnight_start: "2026-10-01",
  fortnight_end: "2026-10-15",
} as const;

describe("creditNoteRow", () => {
  it("names a credit note issued under the contingency code with its point of sale and number", () => {
    expect(creditNoteRow(ISSUED_OFFLINE)).toEqual({
      label: "Nota de crédito C · CAEA",
      value: "PV 00009 · Nº 00000041",
    });
  });

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

describe("creditNoteRow of a credit note to be regularized", () => {
  it("says it is to be regularized", () => {
    expect(creditNoteRow({ kind: "regularization_required" })).toEqual({
      label: "Nota de crédito C",
      value: "A regularizar",
    });
  });
});

describe("creditNoteRowOf", () => {
  it("keeps the void's row as it is", () => {
    expect(creditNoteRowOf({ origin: "sale_void", standing: AUTHORIZED })).toEqual(
      creditNoteRow(AUTHORIZED),
    );
  });

  it.each([
    [AUTHORIZED, "Nota de crédito C de devolución", "PV 00004 · Nº 00000012"],
    [ISSUED_OFFLINE, "Nota de crédito C de devolución · CAEA", "PV 00009 · Nº 00000041"],
    [{ kind: "in_progress" } as const, "Nota de crédito C de devolución", "En trámite con ARCA"],
  ])("says a return's credit note is the return's: %j", (standing, label, value) => {
    expect(creditNoteRowOf({ origin: "sale_return", standing })).toEqual({ label, value });
  });
});

describe("creditNotePrintButton", () => {
  it("names the only credit note's original as the credit note", () => {
    expect(
      creditNotePrintButton({ standing: AUTHORIZED, next_copy: { kind: "original" } }, false),
    ).toBe("Imprimir nota de crédito");
  });

  it("names the only credit note's duplicate as the credit note's, unlike the sale's receipt", () => {
    expect(
      creditNotePrintButton(
        { standing: ISSUED_OFFLINE, next_copy: { kind: "duplicate", order_number: 2 } },
        false,
      ),
    ).toBe("Reimprimir duplicado de nota de crédito");
  });

  it("names the original of one of several credit notes by its point of sale and number", () => {
    expect(
      creditNotePrintButton({ standing: AUTHORIZED, next_copy: { kind: "original" } }, true),
    ).toBe("Imprimir nota de crédito PV 00004 · Nº 00000012");
  });

  it("names the duplicate of one of several credit notes by its point of sale and number", () => {
    expect(
      creditNotePrintButton(
        { standing: ISSUED_OFFLINE, next_copy: { kind: "duplicate", order_number: 2 } },
        true,
      ),
    ).toBe("Reimprimir duplicado de nota de crédito PV 00009 · Nº 00000041");
  });

  it.each([
    { kind: "in_progress" },
    { kind: "rejected" },
    { kind: "already_credited" },
    { kind: "regularization_required" },
  ] as const)(
    "names one of several credit notes with no number only as a credit note: %j",
    (standing) => {
      expect(creditNotePrintButton({ standing, next_copy: { kind: "original" } }, true)).toBe(
        "Imprimir nota de crédito",
      );
    },
  );
});

describe("voidedSaleNotice", () => {
  it("says the credit note was left to be regularized and who to tell", () => {
    expect(voidedSaleNotice({ kind: "regularization_required" })).toEqual({
      tone: "warning",
      title: "Venta anulada",
      description: "La nota de crédito quedó para regularizar. Avisá al Administrador.",
    });
  });

  it.each([null, AUTHORIZED, ISSUED_OFFLINE])(
    "only says the merchandise went back to stock: %j",
    (creditNote) => {
      expect(voidedSaleNotice(creditNote)).toEqual({
        tone: "success",
        title: "Venta anulada",
        description: "La mercadería volvió al stock.",
      });
    },
  );

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
