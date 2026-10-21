import { aCompletedSaleFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedReceiptFact } from "./replenished-receipt-facts";
import { applyReplenishedSaleFact } from "./replenished-sale-facts";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

let database: LocalDatabase;

function printState(saleId: string, attemptedAt: string, printedAt: string | null): ReceiptFact {
  return {
    kind: "sale_print_state_changed",
    printState: {
      saleId,
      printAttemptedAt: new Date(attemptedAt),
      printedAt: printedAt === null ? null : new Date(printedAt),
    },
  };
}

function reprint(
  orderNumber: number,
  reason: Extract<ReceiptFact, { kind: "reprint_recorded" }>["reprint"]["reason"],
  saleId = "sale-1",
): ReceiptFact {
  return {
    kind: "reprint_recorded",
    reprint: {
      saleId,
      orderNumber,
      requestedBy: "cashier-1",
      authorizedBy: "supervisor-1",
      reason,
      occurredAt: new Date("2026-10-07T10:30:00.000Z"),
    },
  };
}

function printing() {
  return database
    .prepare("SELECT print_attempted_at, printed_at FROM sales WHERE id = 'sale-1'")
    .get();
}

function reprints() {
  return database
    .prepare(
      "SELECT sale_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at FROM sale_reprints ORDER BY order_number",
    )
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  insertOpenedSession(database, {
    id: "session-1",
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T08:00:00.000Z"),
    openingFloat: 0,
    state: "OPEN",
  });
  applyReplenishedSaleFact(database, aCompletedSaleFact({ operationNumber: 1 }), {
    eventId: "event-1",
    deviceId: "device-old",
  });
});

afterEach(() => {
  database.close();
});

describe("replenishing the printing of a sale into a restored register", () => {
  it("holds when the receipt was sent to the printer and when it was printed", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T10:00:05.000Z", "2026-10-07T10:00:09.000Z"),
    );

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T10:00:05.000Z",
      printed_at: "2026-10-07T10:00:09.000Z",
    });
  });

  it("holds an attempt that was not printed without a printed moment", () => {
    applyReplenishedReceiptFact(database, printState("sale-1", "2026-10-07T10:00:05.000Z", null));

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T10:00:05.000Z",
      printed_at: null,
    });
  });

  it("keeps the later attempt the snapshot already holds over an earlier one", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T10:09:00.000Z", "2026-10-07T10:09:03.000Z"),
    );

    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T10:00:05.000Z", "2026-10-07T10:00:09.000Z"),
    );

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T10:09:00.000Z",
      printed_at: "2026-10-07T10:09:03.000Z",
    });
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(database, printState("sale-9", "2026-10-07T10:00:05.000Z", null)),
    ).toThrow("sale sale-9 is not held");
  });
});

describe("replenishing the reprints of a sale into a restored register", () => {
  it("holds a reprint with who asked for it, who authorized it and why", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "requested", text: "Se mojo" }));
    applyReplenishedReceiptFact(database, reprint(2, { kind: "retry" }));

    expect(reprints()).toEqual([
      {
        sale_id: "sale-1",
        order_number: 1,
        requested_by: "cashier-1",
        authorized_by: "supervisor-1",
        reason_kind: "requested",
        reason_text: "Se mojo",
        occurred_at: "2026-10-07T10:30:00.000Z",
      },
      {
        sale_id: "sale-1",
        order_number: 2,
        requested_by: "cashier-1",
        authorized_by: "supervisor-1",
        reason_kind: "retry",
        reason_text: null,
        occurred_at: "2026-10-07T10:30:00.000Z",
      },
    ]);
  });

  it("changes nothing when the snapshot already holds the reprint", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }));
    const before = reprints();

    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }));

    expect(reprints()).toEqual(before);
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-9")),
    ).toThrow("sale sale-9 is not held");
  });
});
