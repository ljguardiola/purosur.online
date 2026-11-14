import { describe, expect, it } from "vitest";
import { backupTickets } from "../shell/test-support/contingency-backup-tickets";
import { contingencyBackupTicketsNotices } from "./contingency-backup-tickets-notices";

type Tickets = Parameters<typeof backupTickets>[0];

function noticesOf(tickets: Tickets) {
  return contingencyBackupTicketsNotices(backupTickets(tickets));
}

describe("contingencyBackupTicketsNotices", () => {
  it("has nothing to say when no ticket needs attention", () => {
    expect(noticesOf({ kept: 3 })).toEqual([]);
    expect(noticesOf({ discardable: 3, may_discard: false })).toEqual([]);
  });

  it("lists the missing key first, then the tickets to print, then the discard", () => {
    const notices = noticesOf({
      to_print: 1,
      missing_key: 1,
      discardable: 1,
      may_discard: true,
    });

    expect(notices.map((notice) => notice.title)).toEqual([
      "No se pudo armar el ticket de respaldo",
      "Tickets de respaldo sin imprimir",
      "Ya podés descartar los tickets de respaldo",
    ]);
  });

  describe("tickets that did not come out of the printer", () => {
    it("counts those waiting to print and those waiting for the customer's document in the subtitle", () => {
      const [notice] = noticesOf({ to_print: 2, awaiting_customer_document: 1 });

      expect(notice).toMatchObject({
        tone: "warning",
        title: "Tickets de respaldo sin imprimir",
        subtitle: "3 sin imprimir",
        description: "3 tickets de respaldo de contingencia todavía no salieron de la impresora.",
        whatToDo: "Salen solos después del documento del cliente.",
      });
    });

    it("speaks in the singular for one ticket", () => {
      const [notice] = noticesOf({ to_print: 1 });

      expect(notice?.description).toBe(
        "1 ticket de respaldo de contingencia todavía no salió de la impresora.",
      );
    });

    it.each([
      [
        "paper_out",
        "Poné un rollo nuevo y cerrá la tapa. Salen solos cuando la impresora tenga papel.",
      ],
      ["cover_open", "Cerrá la tapa de la impresora. Salen solos cuando se cierre."],
      [
        "not_responding",
        "Revisá que esté encendida y con el cable conectado. Salen solos cuando vuelva a responder.",
      ],
      [
        "printer_not_configured",
        "Cargá la dirección de la impresora en Ajustes. Salen solos después.",
      ],
      ["failed", "Salen solos en el próximo intento."],
    ] as const)("says what to do when the printer reports %s", (printer, whatToDo) => {
      const [notice] = noticesOf({ to_print: 1, printer });

      expect(notice?.whatToDo).toBe(whatToDo);
    });
  });

  describe("tickets with no backup key", () => {
    it("tells to warn the administrator, in the error tone and with no subtitle", () => {
      const [notice] = noticesOf({ missing_key: 2 });

      expect(notice).toMatchObject({
        tone: "error",
        title: "No se pudo armar el ticket de respaldo",
        description: "La caja no tiene su clave de respaldo para 2 operaciones.",
        whatToDo:
          "Avisá al administrador: se resuelve cuando la caja vuelva a conectarse con la nube.",
      });
      expect(notice).not.toHaveProperty("subtitle");
    });

    it("speaks in the singular for one operation", () => {
      const [notice] = noticesOf({ missing_key: 1 });

      expect(notice?.description).toBe("La caja no tiene su clave de respaldo para 1 operación.");
    });
  });

  describe("tickets that may be discarded", () => {
    it("counts the stored tickets in the subtitle and leaves the discard to the Supr key", () => {
      const [notice] = noticesOf({ discardable: 3, may_discard: true });

      expect(notice).toMatchObject({
        tone: "success",
        title: "Ya podés descartar los tickets de respaldo",
        subtitle: "3 tickets guardados",
        discardable: true,
      });
      expect(notice).not.toHaveProperty("description");
      expect(notice).not.toHaveProperty("whatToDo");
    });

    it("speaks in the singular for one ticket", () => {
      const [notice] = noticesOf({ discardable: 1, may_discard: true });

      expect(notice?.subtitle).toBe("1 ticket guardado");
    });

    it("tells a person the core would not let discard them that whoever sells here closes the notice", () => {
      const [notice] = noticesOf({ discardable: 3, may_discard: true, discard_permitted: false });

      expect(notice).toMatchObject({
        title: "Ya podés descartar los tickets de respaldo",
        whatToDo: "Tiralos. Este aviso lo cierra quien venda en esta caja.",
        discardable: false,
      });
    });
  });

  it("writes the counts with the thousands separator", () => {
    const [missingKey, toPrint, discard] = noticesOf({
      to_print: 1500,
      awaiting_customer_document: 498,
      missing_key: 1998,
      discardable: 1998,
      may_discard: true,
    });

    expect(toPrint?.subtitle).toBe("1.998 sin imprimir");
    expect(missingKey?.description).toBe(
      "La caja no tiene su clave de respaldo para 1.998 operaciones.",
    );
    expect(discard?.subtitle).toBe("1.998 tickets guardados");
  });
});
