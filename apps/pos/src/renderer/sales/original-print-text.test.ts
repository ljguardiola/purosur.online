import { describe, expect, it } from "vitest";
import { creditNotePrintNotice } from "./original-print-text";

describe("creditNotePrintNotice", () => {
  it("says it comes out as soon as the printer is ready, for the customer", () => {
    expect(creditNotePrintNotice("started")).toEqual({
      tone: "success",
      title: "La nota de crédito sale en cuanto la impresora esté lista",
      description: "Entregásela al cliente.",
    });
  });

  it("says the credit note may have come out when a print of it was already tried, and that it is reprinted as a duplicate", () => {
    expect(creditNotePrintNotice("already_attempted")).toEqual({
      tone: "error",
      title: "Puede que la nota de crédito haya salido",
      description: "Ahora se reimprime como duplicado, pidiendo el motivo.",
    });
  });

  it.each([
    [
      "busy",
      "Todavía puede salir una impresión de esta venta",
      "Esperá a que termine antes de imprimir la nota de crédito.",
    ],
    [
      "printer_not_configured",
      "La impresora no está configurada",
      "Configurala para imprimir la nota de crédito.",
    ],
    [
      "lacks_permission",
      "No tenés permiso para imprimir la nota de crédito",
      "Pedile a alguien con permiso que la imprima.",
    ],
    ["unavailable", "No se pudo imprimir la nota de crédito", "Probá de nuevo."],
  ] as const)("refuses %s", (kind, title, description) => {
    expect(creditNotePrintNotice(kind)).toEqual({ tone: "error", title, description });
  });
});
