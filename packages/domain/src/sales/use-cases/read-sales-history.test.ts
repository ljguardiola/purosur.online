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
      paymentMethods: ["CASH"],
      total: 1000 * number,
      fiscal: NO_DOCUMENT,
      voided: false,
      ...overrides,
    },
  };
}

function manySales(count: number): FakeHistorySale[] {
  return Array.from({ length: count }, (_, index) => sale(index + 1));
}

describe("readSalesHistory", () => {
  it("shows a sale's time, payment methods and total", () => {
    const history = new FakeRegisterSalesHistory([
      sale(7, { paymentMethods: ["CASH", "TRANSFER"], total: 4500 }),
    ]);

    const page = readSalesHistory({ history }, { session: "all", page: 1 });

    expect(page.rows).toEqual([
      {
        saleId: "sale-7",
        occurredAt: new Date("2026-10-08T12:07:00.000Z"),
        comprobante: { kind: "none" },
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
            authorization: "real_time",
            pointOfSale: 3,
            number: 1204,
          },
        },
      }),
    ]);

    const [row] = readSalesHistory({ history }, { session: "all", page: 1 }).rows;

    expect(row?.comprobante).toEqual({
      kind: "fiscal",
      documentType: "factura_c",
      authorization: "real_time",
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
            authorization: "real_time",
            pointOfSale: 3,
            number: 1205,
          },
        },
      }),
    ]);

    const { rows } = readSalesHistory({ history }, { session: "all", page: 1 });

    expect(rows.map(({ comprobante, standing }) => [comprobante.kind, standing])).toEqual([
      ["deferred_non_fiscal", "deferred"],
      ["none", "in_progress"],
    ]);
  });

  it("answers the page size and the total of all the sales that match, not only the page", () => {
    const history = new FakeRegisterSalesHistory(manySales(120));

    const page = readSalesHistory({ history }, { session: "all", page: 1 });

    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(120);
    expect(page.pageSize).toBe(50);
  });

  it("reads the asked page by skipping the pages before it", () => {
    const history = new FakeRegisterSalesHistory(manySales(120));

    const page = readSalesHistory({ history }, { session: "all", page: 3 });

    expect(page.rows).toHaveLength(20);
    expect(history.filters).toEqual([{ scope: "register", filter: { offset: 100, limit: 50 } }]);
  });

  it("reads the sales of the open session when asked for it", () => {
    const history = new FakeRegisterSalesHistory([sale(1), sale(2, {}, false)]);

    const page = readSalesHistory({ history }, { session: "open", page: 1 });

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
    expect(page.total).toBe(1);
    expect(history.filters.map(({ scope }) => scope)).toEqual(["open_session"]);
  });

  it("shows a voided sale as voided, without a comprobante", () => {
    const history = new FakeRegisterSalesHistory([sale(1, { voided: true })]);

    const { rows } = readSalesHistory({ history }, { session: "all", page: 1 });

    expect(rows.map(({ comprobante, standing }) => [comprobante.kind, standing])).toEqual([
      ["none", "voided"],
    ]);
  });
});

describe("readSalesHistory searching by document number", () => {
  function invoiced(
    number: number,
    overrides: Partial<NonNullable<SaleFiscalFacts["fiscalDocument"]>> = {},
  ): SaleFiscalFacts {
    return {
      deferred: false,
      fiscalDocument: {
        state: "AUTHORIZED",
        documentType: "factura_c",
        authorization: "real_time",
        pointOfSale: 3,
        number,
        ...overrides,
      },
    };
  }

  const search = (document: { pointOfSale: number | null; number: number }, session = "all") => ({
    session: session as "open" | "all",
    page: 1,
    document,
  });

  it("lists the sales whose invoice has the typed number in any point of sale", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, { fiscal: invoiced(187) }),
      sale(2, { fiscal: invoiced(188) }),
      sale(3, { fiscal: invoiced(187, { pointOfSale: 7 }) }),
    ]);

    const page = readSalesHistory({ history }, search({ pointOfSale: null, number: 187 }));

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-1", "sale-3"]);
    expect(page.total).toBe(2);
  });

  it("lists only the sales of the typed point of sale when one is typed", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, { fiscal: invoiced(187) }),
      sale(3, { fiscal: invoiced(187, { pointOfSale: 7 }) }),
    ]);

    const page = readSalesHistory({ history }, search({ pointOfSale: 7, number: 187 }));

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-3"]);
  });

  it("finds a sale invoiced under an offline code", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, { fiscal: invoiced(8, { authorization: "offline_code", pointOfSale: 31 }) }),
    ]);

    const page = readSalesHistory({ history }, search({ pointOfSale: 31, number: 8 }));

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
  });

  it("leaves out a sale whose document with that number was not authorized, whatever the store returns", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, { fiscal: invoiced(187, { state: "REJECTED" }) }),
      sale(2, { fiscal: invoiced(187) }),
    ]);

    const page = readSalesHistory({ history }, search({ pointOfSale: null, number: 187 }));

    expect(page.rows.map(({ saleId }) => saleId)).toEqual(["sale-2"]);
    expect(page.total).toBe(1);
  });

  it("asks for the sales of the open session or of the register as the session says", () => {
    const history = new FakeRegisterSalesHistory([
      sale(1, { fiscal: invoiced(187) }),
      sale(2, { fiscal: invoiced(187) }, false),
    ]);

    const open = readSalesHistory({ history }, search({ pointOfSale: null, number: 187 }, "open"));
    const everyone = readSalesHistory({ history }, search({ pointOfSale: null, number: 187 }));

    expect(open.rows.map(({ saleId }) => saleId)).toEqual(["sale-1"]);
    expect(everyone.rows.map(({ saleId }) => saleId)).toEqual(["sale-1", "sale-2"]);
    expect(history.documentSearches).toEqual([
      { scope: "open_session", document: { pointOfSale: null, number: 187 } },
      { scope: "register", document: { pointOfSale: null, number: 187 } },
    ]);
    expect(history.filters).toEqual([]);
  });

  it("pages the sales found and counts all of them", () => {
    const history = new FakeRegisterSalesHistory(
      Array.from({ length: 120 }, (_, index) => sale(index + 1, { fiscal: invoiced(187) })),
    );

    const page = readSalesHistory(
      { history },
      { ...search({ pointOfSale: null, number: 187 }), page: 3 },
    );

    expect(page.rows).toHaveLength(20);
    expect(page.rows[0]?.saleId).toBe("sale-101");
    expect(page.total).toBe(120);
    expect(page.pageSize).toBe(50);
  });

  it("shows a found sale as it shows any other row", () => {
    const history = new FakeRegisterSalesHistory([sale(7, { fiscal: invoiced(187), total: 4500 })]);

    const [row] = readSalesHistory({ history }, search({ pointOfSale: null, number: 187 })).rows;

    expect(row).toMatchObject({
      saleId: "sale-7",
      total: 4500,
      standing: "completed",
      comprobante: { kind: "fiscal", number: 187, pointOfSale: 3 },
    });
  });

  it("lists nothing for a number no sale has", () => {
    const history = new FakeRegisterSalesHistory([sale(1, { fiscal: invoiced(187) })]);

    const page = readSalesHistory({ history }, search({ pointOfSale: null, number: 9 }));

    expect(page).toEqual({ rows: [], total: 0, pageSize: 50 });
  });
});
