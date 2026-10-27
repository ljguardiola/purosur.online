import { completeReturn } from "@purosur/domain/returns/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import { SqliteReturnLedger } from "./sqlite-return-ledger";
import { openSecondSession, openSoldSaleDatabase } from "./test-support/sold-sale-database";

const RETURNED_AT = new Date("2026-09-20T15:00:00.000Z");

let database: LocalDatabase;
let idCount: number;

const ids = {
  next: () => {
    idCount += 1;
    return `id-${idCount}`;
  },
};

function ledger(chainKey: string | null = CHAIN_KEY): SqliteReturnLedger {
  return new SqliteReturnLedger(database, chainKey ?? undefined);
}

function returnYerba(
  options: {
    disposition?: "restock" | "discard";
    chainKey?: string | null;
    authorizedBy?: string;
  } = {},
) {
  return completeReturn(
    {
      ledger: ledger(options.chainKey),
      clock: { now: () => RETURNED_AT },
      ids,
      authority: {
        authorize: async () => ({
          kind: "granted",
          grant: { actorId: "u1", authorizedBy: options.authorizedBy },
        }),
      },
    },
    {
      saleId: "sale-1",
      ticketSource: "TYPED",
      lines: [
        {
          saleLineId: "line-1",
          quantity: 2,
          reason: "change_of_mind",
          disposition: options.disposition ?? "restock",
        },
      ],
      refunds: [{ paymentId: "pay-cash", amount: 5000 }],
    },
  );
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT count(*) AS total FROM ${table}`).get()
    ?.total as number;
}

function balanceOf(productId: string): number | undefined {
  return database
    .prepare<[string], { quantity: number }>(
      "SELECT quantity FROM stock_balances WHERE product_id = ?",
    )
    .get(productId)?.quantity;
}

beforeEach(() => {
  idCount = 0;
  database = openSoldSaleDatabase();
  openSecondSession(database);
});

afterEach(() => {
  database.close();
});

describe("the register's open session, seen by a return", () => {
  it("is the session that is open now, not the sale's own", () => {
    expect(ledger().transaction((tx) => tx.openSession())).toEqual({
      id: "session-2",
      openedBy: "u1",
    });
  });

  it("is none while no session is open", () => {
    database.exec(
      "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-20T20:00:00.000Z' WHERE state = 'OPEN'",
    );

    expect(ledger().transaction((tx) => tx.openSession())).toBeUndefined();
  });
});

describe("completing a return in the register", () => {
  it("keeps the return and its lines, with who authorized it and how the ticket was read", async () => {
    const outcome = await returnYerba({ authorizedBy: "u2" });

    expect(outcome).toMatchObject({ kind: "completed", refundedTotal: 5000 });
    expect(
      database
        .prepare(
          "SELECT sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at FROM returns",
        )
        .all(),
    ).toEqual([
      {
        sale_id: "sale-1",
        register_id: "register-1",
        device_id: "device-a",
        session_id: "session-2",
        actor_id: "u1",
        authorized_by: "u2",
        ticket_source: "TYPED",
        occurred_at: RETURNED_AT.toISOString(),
      },
    ]);
    expect(
      database
        .prepare(
          "SELECT sale_line_id, quantity, reason, disposition, refunded_amount FROM return_lines",
        )
        .all(),
    ).toEqual([
      {
        sale_line_id: "line-1",
        quantity: 2,
        reason: "change_of_mind",
        disposition: "restock",
        refunded_amount: 5000,
      },
    ]);
  });

  it("pays the refund in cash out of the open session and imputes it to the chosen payment", async () => {
    await returnYerba();

    expect(
      database
        .prepare("SELECT session_id, type, amount, ref_type, actor_id FROM cash_movements")
        .all(),
    ).toEqual([
      { session_id: "session-2", type: "REFUND", amount: 5000, ref_type: "return", actor_id: "u1" },
    ]);
    expect(
      database.prepare("SELECT payment_id, method, amount, state FROM payment_refunds").all(),
    ).toEqual([{ payment_id: "pay-cash", method: "CASH", amount: 5000, state: "APPROVED" }]);
    expect(
      database
        .prepare<[], { ref_id: string; id: string }>("SELECT id, ref_id FROM cash_movements")
        .get()?.ref_id,
    ).toBe(database.prepare<[], { id: string }>("SELECT id FROM returns").get()?.id);
  });

  it("puts a restocked item back on the shelf", async () => {
    await returnYerba({ disposition: "restock" });

    expect(
      database.prepare("SELECT product_id, kind, sale_line_id, delta FROM stock_movements").all(),
    ).toEqual([{ product_id: "yerba", kind: "return", sale_line_id: "line-1", delta: 2000 }]);
    expect(balanceOf("yerba")).toBe(2000);
  });

  it("puts a discarded item back and then takes it out as a loss, leaving the count as it was", async () => {
    await returnYerba({ disposition: "discard" });

    expect(
      database
        .prepare("SELECT product_id, kind, sale_line_id, delta FROM stock_movements ORDER BY rowid")
        .all(),
    ).toEqual([
      { product_id: "yerba", kind: "return", sale_line_id: "line-1", delta: 2000 },
      { product_id: "yerba", kind: "loss", sale_line_id: null, delta: -2000 },
    ]);
    expect(balanceOf("yerba")).toBe(0);
  });

  it("queues the sale_returned event on the outbox, in the same transaction", async () => {
    await returnYerba();

    expect(
      database
        .prepare(
          "SELECT aggregate_type, event_type, schema_version, actor_id FROM outbox WHERE event_type = 'sale_returned'",
        )
        .all(),
    ).toEqual([
      { aggregate_type: "Return", event_type: "sale_returned", schema_version: 1, actor_id: "u1" },
    ]);
  });

  it("leaves no trace when the register has no open session", async () => {
    database.exec(
      "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-20T20:00:00.000Z' WHERE state = 'OPEN'",
    );

    expect(await returnYerba()).toEqual({ kind: "no_open_session" });
    for (const table of [
      "returns",
      "return_lines",
      "payment_refunds",
      "cash_movements",
      "stock_movements",
      "outbox",
    ]) {
      expect(count(table)).toBe(0);
    }
  });

  it("is unavailable, writing nothing, while the register has no outbox chain key", async () => {
    expect(await returnYerba({ chainKey: null })).toEqual({ kind: "unavailable" });
    expect(count("returns")).toBe(0);
  });

  it("leaves no trace when a write fails half way", async () => {
    database.exec(
      `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at)
       VALUES ('id-4', 'yerba', 'loss', -1, '2026-09-13T12:00:00.000Z')`,
    );

    await expect(returnYerba()).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    for (const table of [
      "returns",
      "return_lines",
      "payment_refunds",
      "cash_movements",
      "outbox",
    ]) {
      expect(count(table)).toBe(0);
    }
    expect(count("stock_movements")).toBe(1);
    expect(balanceOf("yerba")).toBeUndefined();
  });
});

describe("what the register knows of a sale after a return", () => {
  it("reads the line as returned and the cash payment as partly given back", async () => {
    await returnYerba();

    const found = ledger().transaction((tx) =>
      tx.saleForReturn({ kind: "sale", saleId: "sale-1" }),
    );

    expect(found?.returned).toEqual([{ saleLineId: "line-1", quantity: 2, refundedAmount: 5000 }]);
    expect(found?.payments.find(({ id }) => id === "pay-cash")?.refundedAmount).toBe(5000);
  });
});
