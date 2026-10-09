import { describe, expect, it } from "vitest";
import type { SaleFiscalFacts } from "../model/sale-history.js";
import { readSalesHistory } from "./read-sales-history.js";
import type { SalesHistoryEntry } from "./register-sales-history.js";
import {
  type FakeHistorySale,
  FakeRegisterSalesHistory,
} from "./test-support/fake-register-sales-history.js";

const NO_DOCUMENT: SaleFiscalFacts = { deferred: false, fiscalDocument: null };

function sale(
  number: number,
  overrides: Partial<SalesHistoryEntry> = {},
  inOpenSession = true,
): FakeHistorySale {
  return {
    inOpenSession,
    entry: {
      saleId: `sale-${number}`,
      occurredAt: new Date(`2026-10-08T12:${String(number % 60).padStart(2, "0")}:00.000Z`),
      operationNumber: number,
      paymentMethods: ["CASH"],
      total: 1000 * number,
      fiscal: NO_DOCUMENT,
      ...overrides,
    },
  };
}

function manySales(count: number): FakeHistorySale[] {
  return Array.from({ length: count }, (_, index) => sale(index + 1));
}

describe("readSalesHistory", () => {
  it("shows a sale's time, operation number, payment methods and total", () => {
    const history = new FakeRegisterSalesHistory([
      sale(7, { paymentMethods: ["CASH", "TRANSFER"], total: 4500 }),
    ]);

    const page = readSalesHistory({ history }, { session: "all", standing: undefined, page: 1 });

    expect(page.rows).toEqual([
      {
        saleId: "sale-7",
        occurredAt: new Date("2026-10-08T12:07:00.000Z"),
        comprobante: { kind: "none" },
        operationNumber: 7,
        paymentMethods: ["CASH", "TRANSFER"],
        total: 4500,
        standing: "completed",
      },
    ]);
  });

  it("shows the authorized fiscal document as the comprobante of a completed sale", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, {
        fiscal: {
          deferred: false,
          fiscalDocument: {
            state: "AUTHORIZED",
            documentType: "factura_c",
            pointOfSale: 3,
            number: 1204,
          },
        },
      }),
    ]);

    const [row] = readSalesHistory(
      { history },
      { session: "all", standing: undefined, page: 1 },
    ).rows;

    expect(row?.comprobante).toEqual({
      kind: "fiscal",
      documentType: "factura_c",
      pointOfSale: 3,
      number: 1204,
    });
    expect(row?.standing).toBe("completed");
  });

  it("shows a deferred sale with its non-fiscal comprobante and a sale being requested as in progress", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, { fiscal: { deferred: true, fiscalDocument: null } }),
      sale(2, {
        fiscal: {
          deferred: false,
          fiscalDocument: {
            state: "REQUESTING",
            documentType: "factura_c",
            pointOfSale: 3,
            number: 1205,
          },
        },
      }),
    ]);

    const { rows } = readSalesHistory(
      { history },
      { session: "all", standing: undefined, page: 1 },
    );

    expect(rows.map(({ comprobante, standing }) => [comprobante.kind, standing])).toEqual([
      ["deferred_non_fiscal", "deferred"],
      ["none", "in_progress"],
    ]);
  });

  it("answers the page size and the total of all the sales that match, not only the page", () => {
    const history = new FakeRegisterSalesHistory(manySales(120));

    const page = readSalesHistory({ history }, { session: "all", standing: undefined, page: 1 });

    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(120);
    expect(page.pageSize).toBe(50);
  });

  it("reads the asked page by skipping the pages before it", () => {
    const history = new FakeRegisterSalesHistory(manySales(120));

    const page = readSalesHistory({ history }, { session: "all", standing: undefined, page: 3 });

    expect(page.rows).toHaveLength(20);
    expect(history.filters).toEqual([
      { scope: "register", filter: { standing: undefined, offset: 100, limit: 50 } },
    ]);
  });

  it("reads the sales of the open session when asked for it", () => {
    const history = new FakeRegisterSalesHistory([sale(1), sale(2, {}, false)]);

    const page = readSalesHistory({ history }, { session: "open", standing: undefined, page: 1 });

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
    expect(page.total).toBe(1);
    expect(history.filters.map(({ scope }) => scope)).toEqual(["open_session"]);
  });

  it("asks only for the sales in the asked standing", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1),
      sale(2, { fiscal: { deferred: true, fiscalDocument: null } }),
    ]);

    const page = readSalesHistory({ history }, { session: "all", standing: "deferred", page: 1 });

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-2"]);
    expect(page.total).toBe(1);
  });
});
