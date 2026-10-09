import { type SaleStanding, saleStandingOf } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRegisterSalesHistory } from "./sqlite-register-sales-history";

type FiscalState = "REQUESTING" | "AUTHORIZED" | "REJECTED" | "UNKNOWN";

interface SaleSeed {
  id: string;
  session?: string;
  register?: string;
  state?: string;
  occurredAt?: string | null;
  operationNumber?: number | null;
  actor?: string;
  lines?: number[];
  payments?: { method: "CASH" | "TRANSFER"; amount: number }[];
  fiscal?: { state: FiscalState; pointOfSale?: number; number?: number };
  deferred?: boolean;
}

const DECIDED_STANDINGS = ["completed", "in_progress", "deferred"] as const;

let database: LocalDatabase;
let history: SqliteRegisterSalesHistory;
let paymentCount: number;

function openSession(id: string, register = "r1", state = "OPEN"): void {
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
     VALUES ('${id}', '${register}', 'device-1', 'u1', '2026-10-08T08:00:00.000Z', 0, '${state}', ${state === "OPEN" ? "NULL" : "'2026-10-08T20:00:00.000Z'"})`,
  );
}

function addSale({
  id,
  session = "open-session",
  register = "r1",
  state = "COMPLETED",
  occurredAt = "2026-10-08T12:00:00.000Z",
  operationNumber = null,
  actor = "u1",
  lines = [1000],
  payments,
  fiscal,
  deferred = false,
}: SaleSeed): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
       VALUES (?, ?, 'device-1', ?, ?, ?, ?, ?)`,
    )
    .run(id, register, session, actor, state, occurredAt, operationNumber);
  lines.forEach((lineTotal, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
         VALUES (?, ?, ?, ?, 'Producto', 1, ?, 'list-1', 0, ?)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, `p-${index}`, lineTotal, lineTotal);
  });
  for (const payment of payments ?? [
    { method: "CASH" as const, amount: lines.reduce((a, b) => a + b, 0) },
  ]) {
    paymentCount += 1;
    database
      .prepare(
        payment.method === "CASH"
          ? `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
             VALUES (?, ?, 'SALE', 'CASH', 'NONE', ?, NULL, 'APPROVED', ?)`
          : `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
             VALUES (?, ?, 'SALE', 'TRANSFER', 'NONE', ?, NULL, 'u1', ?, 'APPROVED', ?)`,
      )
      .run(
        ...(payment.method === "CASH"
          ? [`pay-${paymentCount}`, id, payment.amount, occurredAt]
          : [`pay-${paymentCount}`, id, payment.amount, occurredAt, occurredAt]),
      );
  }
  if (fiscal !== undefined) {
    database
      .prepare(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES (?, ?, ?, 'FACTURA_C', ?, '2026-10-08', '{}', ?, ?, ?, '2026-10-08T12:00:00.000Z', ?)`,
      )
      .run(
        `doc-${id}`,
        id,
        fiscal.pointOfSale ?? 3,
        fiscal.number ?? paymentCount + 100,
        fiscal.state,
        fiscal.state === "AUTHORIZED" ? "75123456789012" : null,
        fiscal.state === "AUTHORIZED" ? "2026-10-18" : null,
        fiscal.state === "REQUESTING" ? null : "2026-10-08T12:00:01.000Z",
      );
  }
  if (deferred) {
    database
      .prepare(
        "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES (?, 'fiscally_offline', '2026-10-08T12:00:00.000Z')",
      )
      .run(id);
  }
}

function idsOf(page: { entries: { saleId: string }[] }): string[] {
  return page.entries.map(({ saleId }) => saleId);
}

function all(standing?: SaleStanding) {
  return history.salesOfRegister({ standing, offset: 0, limit: 100 });
}

beforeEach(() => {
  paymentCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Marta', 'cashier', 's', 1, 1);`,
  );
  openSession("open-session");
  openSession("old-session", "r1", "CLOSED");
  history = new SqliteRegisterSalesHistory(database);
});

afterEach(() => {
  database.close();
});

describe("SqliteRegisterSalesHistory", () => {
  describe("the listing", () => {
    it("lists the most recent sale first", () => {
      addSale({ id: "early", occurredAt: "2026-10-08T09:00:00.000Z" });
      addSale({ id: "late", occurredAt: "2026-10-08T15:00:00.000Z" });
      addSale({ id: "middle", occurredAt: "2026-10-08T12:00:00.000Z" });

      expect(idsOf(all())).toEqual(["late", "middle", "early"]);
    });

    it("orders sales of the same instant by the order they were recorded, latest first", () => {
      addSale({ id: "first" });
      addSale({ id: "second" });

      expect(idsOf(all())).toEqual(["second", "first"]);
    });

    it("pages the sales and counts every sale that matches, not only the page", () => {
      for (let n = 1; n <= 7; n += 1) {
        addSale({ id: `sale-${n}`, occurredAt: `2026-10-08T12:0${n}:00.000Z` });
      }

      const second = history.salesOfRegister({ standing: undefined, offset: 3, limit: 3 });

      expect(idsOf(second)).toEqual(["sale-4", "sale-3", "sale-2"]);
      expect(second.total).toBe(7);
    });

    it("lists only the completed sales of this register", () => {
      openSession("other-session", "r2");
      addSale({ id: "mine" });
      addSale({ id: "in-progress-cart", state: "OPEN", occurredAt: null, lines: [], payments: [] });
      addSale({ id: "cancelled", state: "CANCELLED" });
      addSale({ id: "voided", state: "VOIDED" });
      addSale({ id: "another-registers", session: "other-session", register: "r2" });

      const page = all();

      expect(idsOf(page)).toEqual(["mine"]);
      expect(page.total).toBe(1);
    });

    it("lists the sales of the open session only, or of every session of the register", () => {
      addSale({ id: "today", session: "open-session", occurredAt: "2026-10-08T12:00:00.000Z" });
      addSale({ id: "yesterday", session: "old-session", occurredAt: "2026-10-07T12:00:00.000Z" });

      const open = history.salesOfOpenSession({ standing: undefined, offset: 0, limit: 50 });

      expect(idsOf(open)).toEqual(["today"]);
      expect(open.total).toBe(1);
      expect(idsOf(all())).toEqual(["today", "yesterday"]);
    });

    it("lists nothing for the open session when the register has none open", () => {
      database.exec(
        "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-08T20:00:00.000Z'",
      );
      addSale({ id: "closed-day" });

      expect(history.salesOfOpenSession({ standing: undefined, offset: 0, limit: 50 })).toEqual({
        entries: [],
        total: 0,
      });
    });

    it("shows the sale's time, operation number, total and payment methods", () => {
      addSale({
        id: "sale-1",
        occurredAt: "2026-10-08T12:34:00.000Z",
        operationNumber: 482,
        lines: [1500, 2500],
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "TRANSFER", amount: 3000 },
        ],
      });

      expect(all().entries).toEqual([
        {
          saleId: "sale-1",
          occurredAt: new Date("2026-10-08T12:34:00.000Z"),
          operationNumber: 482,
          paymentMethods: ["CASH", "TRANSFER"],
          total: 4000,
          fiscal: { deferred: false, fiscalDocument: null },
        },
      ]);
    });

    it("shows no operation number for a sale completed before they were kept", () => {
      addSale({ id: "old", operationNumber: null });

      expect(all().entries[0]?.operationNumber).toBeNull();
    });

    it("names a payment method once however many payments used it", () => {
      addSale({
        id: "sale-1",
        lines: [3000],
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "CASH", amount: 1000 },
          { method: "CASH", amount: 1000 },
        ],
      });

      expect(all().entries[0]?.paymentMethods).toEqual(["CASH"]);
    });

    it("shows the authorized fiscal document's type, point of sale and number", () => {
      addSale({ id: "sale-1", fiscal: { state: "AUTHORIZED", pointOfSale: 7, number: 1204 } });

      expect(all().entries[0]?.fiscal).toEqual({
        deferred: false,
        fiscalDocument: {
          state: "AUTHORIZED",
          documentType: "factura_c",
          pointOfSale: 7,
          number: 1204,
        },
      });
    });

    it("shows that a sale was deferred", () => {
      addSale({ id: "sale-1", deferred: true });

      expect(all().entries[0]?.fiscal).toEqual({ deferred: true, fiscalDocument: null });
    });
  });

  describe("filtering by standing", () => {
    beforeEach(() => {
      addSale({ id: "no-document", occurredAt: "2026-10-08T10:00:00.000Z" });
      addSale({
        id: "authorized",
        occurredAt: "2026-10-08T10:01:00.000Z",
        fiscal: { state: "AUTHORIZED" },
      });
      addSale({
        id: "requesting",
        occurredAt: "2026-10-08T10:02:00.000Z",
        fiscal: { state: "REQUESTING" },
      });
      addSale({ id: "offline", occurredAt: "2026-10-08T10:03:00.000Z", deferred: true });
      addSale({
        id: "rejected",
        occurredAt: "2026-10-08T10:04:00.000Z",
        fiscal: { state: "REJECTED" },
        deferred: true,
      });
      addSale({
        id: "unknown",
        occurredAt: "2026-10-08T10:05:00.000Z",
        fiscal: { state: "UNKNOWN", pointOfSale: 4 },
        deferred: true,
      });
    });

    it("lists every standing when none is asked", () => {
      expect(all().total).toBe(6);
    });

    it("lists the completed sales", () => {
      const page = all("completed");

      expect(idsOf(page)).toEqual(["authorized", "no-document"]);
      expect(page.total).toBe(2);
    });

    it("lists the sales whose fiscal document is being requested", () => {
      const page = all("in_progress");

      expect(idsOf(page)).toEqual(["requesting"]);
      expect(page.total).toBe(1);
    });

    it("lists the deferred sales, including those whose document was rejected or left unknown", () => {
      const page = all("deferred");

      expect(idsOf(page)).toEqual(["unknown", "rejected", "offline"]);
      expect(page.total).toBe(3);
    });

    it("counts the total of the standing asked, whatever the page", () => {
      const page = history.salesOfRegister({ standing: "deferred", offset: 0, limit: 1 });

      expect(idsOf(page)).toEqual(["unknown"]);
      expect(page.total).toBe(3);
    });

    it("filters the open session's sales by standing too", () => {
      addSale({ id: "closed-session-deferred", session: "old-session", deferred: true });

      const page = history.salesOfOpenSession({ standing: "deferred", offset: 0, limit: 50 });

      expect(page.total).toBe(3);
    });

    it.each(DECIDED_STANDINGS)(
      "lists under %s exactly the sales the domain gives that standing",
      (standing) => {
        const expected = all()
          .entries.filter(({ fiscal }) => saleStandingOf(fiscal) === standing)
          .map(({ saleId }) => saleId);

        expect(idsOf(all(standing))).toEqual(expected);
      },
    );
  });

  describe("the detail of one sale", () => {
    it("shows who served it, its lines, its payments and its fiscal facts", () => {
      addSale({
        id: "sale-1",
        occurredAt: "2026-10-08T12:34:00.000Z",
        operationNumber: 482,
        lines: [1500, 2500, 500],
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "TRANSFER", amount: 3500 },
        ],
        fiscal: { state: "AUTHORIZED", pointOfSale: 7, number: 1204 },
      });

      expect(history.saleOfRegister("sale-1")).toEqual({
        saleId: "sale-1",
        occurredAt: new Date("2026-10-08T12:34:00.000Z"),
        operationNumber: 482,
        servedByFirstName: "Marta",
        lineCount: 3,
        total: 4500,
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "TRANSFER", amount: 3500 },
        ],
        fiscal: {
          deferred: false,
          fiscalDocument: {
            state: "AUTHORIZED",
            documentType: "factura_c",
            pointOfSale: 7,
            number: 1204,
          },
        },
      });
    });

    it("finds a sale of a closed session", () => {
      addSale({ id: "old", session: "old-session" });

      expect(history.saleOfRegister("old")?.saleId).toBe("old");
    });

    it("does not find a sale that does not exist, is not completed or belongs to another register", () => {
      openSession("other-session", "r2");
      addSale({ id: "cancelled", state: "CANCELLED" });
      addSale({ id: "another-registers", session: "other-session", register: "r2" });

      expect(history.saleOfRegister("missing")).toBeUndefined();
      expect(history.saleOfRegister("cancelled")).toBeUndefined();
      expect(history.saleOfRegister("another-registers")).toBeUndefined();
    });
  });
});
