import { FIXED_ARGENTINA_ZONE_RULES } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { printoutOf } from "../platform/escpos/test-support/escpos-printout";
import {
  type BackedDocument,
  type ContingencyBackupTicketPrintout,
  renderContingencyBackupTicket,
} from "./escpos-contingency-backup-ticket";

const RULE = "─".repeat(48);

function ticket(
  overrides: Partial<ContingencyBackupTicketPrintout> = {},
): ContingencyBackupTicketPrintout {
  return {
    createdAt: new Date("2026-10-09T15:07:00.000Z"),
    branchAddress: "Av. Belgrano 1450",
    registerName: "Caja 1",
    operation: { kind: "numbered", operationNumber: 482 },
    backs: null,
    qrCodes: ["QR-ONE"],
    ...overrides,
  };
}

function printed(overrides: Partial<ContingencyBackupTicketPrintout> = {}) {
  return printoutOf(renderContingencyBackupTicket(ticket(overrides), FIXED_ARGENTINA_ZONE_RULES));
}

function row(left: string, right: string): string {
  return left + " ".repeat(48 - left.length - right.length) + right;
}

describe("the contingency backup ticket", () => {
  it("writes when it was made on the clock of the zone rules it is given", () => {
    const rules = {
      version: "2026a",
      transitions: [{ from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: 0 }],
    };

    const { textLines } = printoutOf(renderContingencyBackupTicket(ticket(), rules));

    expect(textLines).toContain(row("Fecha 09/10/2026", "Hora 15:07"));
  });

  it("prints its title, its keeping instruction, where and when it was made, the operation and each QR code", () => {
    expect(printed().text).toBe(
      [
        "[init]",
        "[codepage PC850]",
        "[bold]            RESPALDO DE CONTINGENCIA[/bold]",
        RULE,
        "Guardar en la caja de respaldos del local.",
        RULE,
        row("Sucursal", "Av. Belgrano 1450"),
        row("Caja", "Caja 1"),
        row("Fecha 09/10/2026", "Hora 12:07"),
        row("Operación", "000482"),
        RULE,
        "[align center]",
        "[qr model 2]",
        "[qr module 4]",
        "[qr correction M]",
        "[qr store QR-ONE]",
        "[qr print]",
        "[align left]",
        `${" ".repeat(21)}1 de 1`,
        "[feed 5]",
        "[cut partial]",
      ].join("\n"),
    );
  });

  it("numbers every QR code of the ticket out of the total, with room between them", () => {
    const { text, textLines } = printed({ qrCodes: ["QR-A", "QR-B", "QR-C"] });

    expect(text.match(/\[qr store [^\]]+\]/g)).toEqual([
      "[qr store QR-A]",
      "[qr store QR-B]",
      "[qr store QR-C]",
    ]);
    expect(textLines.filter((line) => line.includes(" de 3")).map((line) => line.trim())).toEqual([
      "1 de 3",
      "2 de 3",
      "3 de 3",
    ]);
    expect(text.match(/\[feed dots 16\]/g)).toHaveLength(2);
  });

  it("prints the time of the register's own zone", () => {
    expect(printed({ createdAt: new Date("2026-10-10T01:30:00.000Z") }).textLines).toContain(
      row("Fecha 09/10/2026", "Hora 22:30"),
    );
  });

  it("wraps an address that does not fit beside its label", () => {
    const address = "Avenida Presidente Manuel Quintana 1450, piso 3, oficina B";

    const lines = printed({ branchAddress: address }).textLines;

    const start = lines.findIndex((line) => line.startsWith("Sucursal"));
    const end = lines.findIndex((line) => line.startsWith("Caja"));
    expect(end - start).toBeGreaterThan(1);
    expect(lines.slice(start + 1, end).every((line) => line.length === 48)).toBe(true);
    expect(lines.slice(start, end).join(" ").replace(/\s+/g, " ").replace("Sucursal ", "")).toBe(
      address,
    );
  });

  it.each([
    [{ kind: "cash_movement", movement: "CASH_OUT" }, "Retiro de efectivo"],
    [{ kind: "cash_movement", movement: "WITHDRAWAL" }, "Retiro de efectivo"],
    [{ kind: "cash_movement", movement: "CASH_IN" }, "Ingreso de efectivo"],
    [{ kind: "cash_movement", movement: null }, "Movimiento de efectivo"],
    [{ kind: "cash_session_opening" }, "Apertura de caja"],
    [{ kind: "cash_session_closing" }, "Cierre de caja"],
    [{ kind: "initial_count" }, "Inventario inicial"],
    [{ kind: "clock_correction" }, "Corrección del reloj"],
  ] as const)("names an operation of %j as %s", (operation, name) => {
    expect(printed({ operation }).textLines).toContain(row("Operación", name));
  });

  it("numbers a sale's operation with six digits", () => {
    expect(printed({ operation: { kind: "numbered", operationNumber: 7 } }).textLines).toContain(
      row("Operación", "000007"),
    );
  });

  it.each([
    [{ kind: "invoice", pointOfSale: 3, number: 1234 }, "Factura C 00003-00001234"],
    [{ kind: "credit_note", pointOfSale: 3, number: 12 }, "Nota de crédito C 00003-00000012"],
    [{ kind: "deferred_sale_document", shortCode: "7KQ4M2PA" }, "Documento X 7KQ4-M2PA"],
  ] as const satisfies readonly [BackedDocument, string][])(
    "says which document it backs up when it is %j",
    (backs, text) => {
      const lines = printed({ backs }).textLines;

      expect(lines).toContain(row("Respalda", text));
      expect(lines.indexOf(row("Respalda", text))).toBe(
        lines.indexOf(row("Operación", "000482")) + 1,
      );
    },
  );

  it("leaves out the row of the document when it backs up none", () => {
    expect(printed({ backs: null }).textLines.some((line) => line.startsWith("Respalda"))).toBe(
      false,
    );
  });

  describe("for a return", () => {
    const returned = (
      overrides: Partial<
        Extract<ContingencyBackupTicketPrintout["operation"], { kind: "return" }>
      > = {},
    ) => ({
      kind: "return" as const,
      original: { kind: "operation_number" as const, operationNumber: 482 },
      cashRefunded: 123450,
      ...overrides,
    });

    it("names the return, the original ticket and the cash refunded, before the document it backs", () => {
      const backs = { kind: "credit_note", pointOfSale: 3, number: 12 } as const;

      const lines = printed({ operation: returned(), backs }).textLines;

      const start = lines.indexOf(row("Operación", "Devolución"));
      expect(start).toBeGreaterThan(-1);
      expect(lines.slice(start, start + 4)).toEqual([
        row("Operación", "Devolución"),
        row("Ticket original", "000482"),
        row("Efectivo devuelto", "$ 1.234,50"),
        row("Respalda", "Nota de crédito C 00003-00000012"),
      ]);
    });

    it.each([
      [{ kind: "invoice", pointOfSale: 1, number: 12 }, "Factura C 00001-00000012"],
      [{ kind: "deferred_sale_document", shortCode: "7KQ4M2PA" }, "Documento X 7KQ4-M2PA"],
    ] as const)("names the original ticket of another register's sale as %j", (original, text) => {
      expect(printed({ operation: returned({ original }) }).textLines).toContain(
        row("Ticket original", text),
      );
    });

    it("leaves out the original ticket when the register does not know its number", () => {
      const lines = printed({ operation: returned({ original: null }) }).textLines;

      expect(lines.some((line) => line.startsWith("Ticket original"))).toBe(false);
      expect(lines).toContain(row("Efectivo devuelto", "$ 1.234,50"));
    });

    it("leaves out the cash refunded when nothing was refunded in cash", () => {
      const lines = printed({ operation: returned({ cashRefunded: 0 }) }).textLines;

      expect(lines.some((line) => line.startsWith("Efectivo devuelto"))).toBe(false);
    });
  });
});
