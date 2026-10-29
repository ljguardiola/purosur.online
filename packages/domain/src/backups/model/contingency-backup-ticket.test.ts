import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FiscalEmissionMode } from "../../fiscal/index.js";
import {
  CONTINGENCY_BACKUP_OPERATIONS,
  CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS,
  CONTINGENCY_BACKUP_TICKET_STANDINGS,
  type ContingencyBackupTicketRecord,
  contingencyBackupTicketStanding,
  contingencyBackupTicketsSummary,
  customerDocumentPrinted,
  needsContingencyBackupTicket,
  paidSaleCancellationLeavesBackupTicket,
} from "./contingency-backup-ticket.js";

const REAL_TIME: FiscalEmissionMode = { kind: "real_time" };
const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };
const DEFERRING: FiscalEmissionMode = { kind: "deferring", reason: "deferred_backlog" };
const AT = new Date("2026-10-14T15:00:00.000Z");

function ticket(
  overrides: Partial<ContingencyBackupTicketRecord> = {},
): ContingencyBackupTicketRecord {
  return {
    id: "ticket-1",
    lastDeviceSeq: 10,
    sealed: true,
    customerDocumentPrinted: null,
    printedAt: null,
    discardedAt: null,
    ...overrides,
  };
}

describe("CONTINGENCY_BACKUP_OPERATIONS", () => {
  it("lists every operation that writes outbox events and gets a ticket", () => {
    expect(CONTINGENCY_BACKUP_OPERATIONS).toEqual([
      "sale",
      "paid_sale_cancellation",
      "sale_void",
      "return",
      "cash_movement",
      "cash_session_opening",
      "cash_session_closing",
      "initial_count",
      "clock_correction",
      "reprint",
    ]);
  });
});

describe("CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS", () => {
  it("lists why a printer does not print", () => {
    expect(CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS).toEqual([
      "cover_open",
      "paper_out",
      "not_responding",
      "printer_not_configured",
      "failed",
    ]);
  });
});

describe("CONTINGENCY_BACKUP_TICKET_STANDINGS", () => {
  it("lists every standing a ticket can have", () => {
    expect(CONTINGENCY_BACKUP_TICKET_STANDINGS).toEqual([
      "discarded",
      "discardable",
      "kept",
      "no_longer_needed",
      "missing_key",
      "awaiting_customer_document",
      "to_print",
    ]);
  });
});

describe("needsContingencyBackupTicket", () => {
  const range = { firstDeviceSeq: 5, lastDeviceSeq: 7 };

  it("needs a ticket when the operation wrote events and a mode around it was offline", () => {
    expect(needsContingencyBackupTicket({ modesAround: [REAL_TIME, OFFLINE], range })).toBe(true);
  });

  it("needs a ticket when a mode around the operation was deferring", () => {
    expect(needsContingencyBackupTicket({ modesAround: [DEFERRING], range })).toBe(true);
  });

  it("needs no ticket when every mode around the operation was real time", () => {
    expect(needsContingencyBackupTicket({ modesAround: [REAL_TIME, REAL_TIME], range })).toBe(
      false,
    );
  });

  it("needs no ticket when no mode was seen", () => {
    expect(needsContingencyBackupTicket({ modesAround: [], range })).toBe(false);
  });

  it("needs no ticket when the operation appended no events", () => {
    expect(
      needsContingencyBackupTicket({
        modesAround: [OFFLINE],
        range: { firstDeviceSeq: 8, lastDeviceSeq: 7 },
      }),
    ).toBe(false);
  });

  it("needs a ticket for a single event", () => {
    expect(
      needsContingencyBackupTicket({
        modesAround: [OFFLINE],
        range: { firstDeviceSeq: 7, lastDeviceSeq: 7 },
      }),
    ).toBe(true);
  });
});

describe("paidSaleCancellationLeavesBackupTicket", () => {
  it("leaves a ticket for a cancellation that refunded an approved payment", () => {
    expect(paidSaleCancellationLeavesBackupTicket([{ paymentId: "payment-1" }])).toBe(true);
  });

  it("leaves no ticket for a cancellation that refunded nothing, having no approved payment", () => {
    expect(paidSaleCancellationLeavesBackupTicket([])).toBe(false);
  });
});

describe("contingencyBackupTicketStanding", () => {
  it("is discarded once discarded, whatever else is true", () => {
    expect(contingencyBackupTicketStanding(ticket({ discardedAt: AT, printedAt: AT }), 99)).toBe(
      "discarded",
    );
    expect(contingencyBackupTicketStanding(ticket({ discardedAt: AT }), 0)).toBe("discarded");
  });

  it("is discardable when printed and the cloud has its events", () => {
    expect(contingencyBackupTicketStanding(ticket({ printedAt: AT }), 10)).toBe("discardable");
    expect(contingencyBackupTicketStanding(ticket({ printedAt: AT }), 11)).toBe("discardable");
  });

  it("is kept when printed and the cloud does not have its events yet", () => {
    expect(contingencyBackupTicketStanding(ticket({ printedAt: AT }), 9)).toBe("kept");
  });

  it("is no longer needed when not printed and the cloud already has its events", () => {
    expect(contingencyBackupTicketStanding(ticket(), 10)).toBe("no_longer_needed");
    expect(contingencyBackupTicketStanding(ticket({ sealed: false }), 10)).toBe("no_longer_needed");
  });

  it("is missing its key when not printed, not synced and not sealed", () => {
    expect(contingencyBackupTicketStanding(ticket({ sealed: false }), 9)).toBe("missing_key");
    expect(
      contingencyBackupTicketStanding(ticket({ sealed: false, customerDocumentPrinted: false }), 9),
    ).toBe("missing_key");
  });

  it("awaits the customer document when sealed and that document is not printed", () => {
    expect(contingencyBackupTicketStanding(ticket({ customerDocumentPrinted: false }), 9)).toBe(
      "awaiting_customer_document",
    );
  });

  it("is to print when sealed and the customer document is printed", () => {
    expect(contingencyBackupTicketStanding(ticket({ customerDocumentPrinted: true }), 9)).toBe(
      "to_print",
    );
  });

  it("is to print when sealed and the operation has no customer document", () => {
    expect(contingencyBackupTicketStanding(ticket(), 9)).toBe("to_print");
  });

  it("never prints a ticket the cloud already has, for any ticket", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.boolean(),
        fc.constantFrom(true, false, null),
        (lastDeviceSeq, acked, sealed, customerDocumentPrinted) => {
          fc.pre(acked >= lastDeviceSeq);
          const standing = contingencyBackupTicketStanding(
            ticket({ lastDeviceSeq, sealed, customerDocumentPrinted }),
            acked,
          );
          expect(standing).toBe("no_longer_needed");
        },
      ),
    );
  });

  it("is to print only when sealed, not synced, and its customer document is not pending", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.boolean(),
        fc.constantFrom(true, false, null),
        (lastDeviceSeq, acked, sealed, customerDocumentPrinted) => {
          const standing = contingencyBackupTicketStanding(
            ticket({ lastDeviceSeq, sealed, customerDocumentPrinted }),
            acked,
          );
          expect(standing === "to_print").toBe(
            acked < lastDeviceSeq && sealed && customerDocumentPrinted !== false,
          );
        },
      ),
    );
  });
});

describe("contingencyBackupTicketsSummary", () => {
  it("counts each standing that matters to the screen", () => {
    const tickets = [
      ticket({ id: "a", lastDeviceSeq: 20 }),
      ticket({ id: "b", lastDeviceSeq: 20, customerDocumentPrinted: false }),
      ticket({ id: "c", lastDeviceSeq: 20, sealed: false }),
      ticket({ id: "d", lastDeviceSeq: 20, printedAt: AT }),
      ticket({ id: "e", lastDeviceSeq: 5, printedAt: AT }),
      ticket({ id: "f", lastDeviceSeq: 5, printedAt: AT, discardedAt: AT }),
      ticket({ id: "g", lastDeviceSeq: 5 }),
    ];

    expect(contingencyBackupTicketsSummary(tickets, 10)).toEqual({
      toPrint: 1,
      awaitingCustomerDocument: 1,
      missingKey: 1,
      kept: 1,
      discardable: 1,
      mayDiscard: false,
    });
  });

  it("may discard when something is discardable and nothing else is pending", () => {
    const tickets = [
      ticket({ id: "e", lastDeviceSeq: 5, printedAt: AT }),
      ticket({ id: "f", lastDeviceSeq: 5, printedAt: AT, discardedAt: AT }),
      ticket({ id: "g", lastDeviceSeq: 5 }),
    ];

    expect(contingencyBackupTicketsSummary(tickets, 10)).toEqual({
      toPrint: 0,
      awaitingCustomerDocument: 0,
      missingKey: 0,
      kept: 0,
      discardable: 1,
      mayDiscard: true,
    });
  });

  it.each([
    ["to print", ticket({ id: "x", lastDeviceSeq: 20 })],
    [
      "awaiting its customer document",
      ticket({ id: "x", lastDeviceSeq: 20, customerDocumentPrinted: false }),
    ],
    ["missing its key", ticket({ id: "x", lastDeviceSeq: 20, sealed: false })],
    ["kept", ticket({ id: "x", lastDeviceSeq: 20, printedAt: AT })],
  ])("may not discard while a ticket is %s", (_name, pending) => {
    const discardable = ticket({ id: "e", lastDeviceSeq: 5, printedAt: AT });

    expect(contingencyBackupTicketsSummary([discardable, pending], 10).mayDiscard).toBe(false);
  });

  it.each([
    ["to print and awaiting its customer document", "a", "b"],
    ["awaiting its customer document and missing its key", "b", "c"],
    ["missing its key and kept", "c", "d"],
  ])("may not discard while tickets are %s", (_name, first, second) => {
    const pending = [
      ticket({ id: "a", lastDeviceSeq: 20 }),
      ticket({ id: "b", lastDeviceSeq: 20, customerDocumentPrinted: false }),
      ticket({ id: "c", lastDeviceSeq: 20, sealed: false }),
      ticket({ id: "d", lastDeviceSeq: 20, printedAt: AT }),
    ].filter(({ id }) => id === first || id === second);
    const discardable = ticket({ id: "e", lastDeviceSeq: 5, printedAt: AT });

    expect(contingencyBackupTicketsSummary([discardable, ...pending], 10).mayDiscard).toBe(false);
  });

  it("may not discard when there is nothing to discard", () => {
    expect(contingencyBackupTicketsSummary([], 10).mayDiscard).toBe(false);
  });
});

describe("customerDocumentPrinted", () => {
  const PRINTS = [true, false, null] as const;

  it("waits for the sale's receipt for a sale", () => {
    for (const saleReceipt of PRINTS) {
      expect(
        customerDocumentPrinted("sale", {
          saleReceipt,
          voidCreditNote: !saleReceipt,
          returnCreditNote: !saleReceipt,
        }),
      ).toBe(saleReceipt);
    }
  });

  it("waits for the credit note of a void, and for nothing when the void has none", () => {
    for (const voidCreditNote of PRINTS) {
      expect(
        customerDocumentPrinted("sale_void", {
          saleReceipt: !voidCreditNote,
          voidCreditNote,
          returnCreditNote: !voidCreditNote,
        }),
      ).toBe(voidCreditNote);
    }
  });

  it("waits for the credit note of a return, and for nothing when the return has none", () => {
    for (const returnCreditNote of PRINTS) {
      expect(
        customerDocumentPrinted("return", {
          saleReceipt: !returnCreditNote,
          voidCreditNote: !returnCreditNote,
          returnCreditNote,
        }),
      ).toBe(returnCreditNote);
    }
  });

  it.each(
    CONTINGENCY_BACKUP_OPERATIONS.filter(
      (operation) => operation !== "sale" && operation !== "sale_void" && operation !== "return",
    ),
  )("waits for no customer document for %s", (operation) => {
    expect(
      customerDocumentPrinted(operation, {
        saleReceipt: false,
        voidCreditNote: false,
        returnCreditNote: false,
      }),
    ).toBe(null);
  });
});
