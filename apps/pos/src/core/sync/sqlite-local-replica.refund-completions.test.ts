import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteSaleLedger } from "../sales/sqlite-sale-ledger";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import { openAdoptedReplica, savePulledChanges } from "./test-support/sqlite-local-replica";

const REFUND_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DONE_BY = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const DONE_AT = "2026-10-10T16:45:00.000Z";

function completionChange(
  changeSeq: number,
  row: { done_by: string; done_at: string } = { done_by: DONE_BY, done_at: DONE_AT },
  refundId = REFUND_ID,
): RegisterPulledChange {
  return {
    changeSeq,
    change: { change_seq: changeSeq, entity: "refund_completion", entity_id: refundId, row },
  };
}

function completions() {
  return database.prepare("SELECT refund_id, done_by, done_at FROM refund_completions").all();
}

function refundsWithTheirCompletion() {
  return database
    .prepare(
      `SELECT refund.id, refund.state, completion.done_by, completion.done_at
       FROM payment_refunds refund
       LEFT JOIN refund_completions completion ON completion.refund_id = refund.id`,
    )
    .all();
}

function recordRefundOfTransferSale(refundId: string): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-a', 'u1', '2026-10-10T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES ('sale-1', 'register-1', 'device-a', 'session-1', 'u1', 'CANCELLED', '2026-10-10T12:00:00.000Z')",
    )
    .run();
  database
    .prepare(
      "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, authorized_by, confirmed_at) VALUES ('payment-1', 'sale-1', 'SALE', 'TRANSFER', 'NONE', 2000, 'APPROVED', '2026-10-10T12:00:00.000Z', 'u1', '2026-10-10T12:00:00.000Z')",
    )
    .run();
  new SqliteSaleLedger(database, { activePerson: () => undefined }).transaction((tx) =>
    tx.recordRefund({
      id: refundId,
      saleId: "sale-1",
      paymentId: "payment-1",
      method: "TRANSFER",
      provider: "NONE",
      amount: 2000,
      state: "PENDING",
      occurredAt: new Date("2026-10-10T12:00:00.000Z"),
    }),
  );
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the refund completions that a register pulls", () => {
  it("record who marked the refund done and when", async () => {
    await savePulledChanges(replica, completionChange(1));

    expect(completions()).toEqual([{ refund_id: REFUND_ID, done_by: DONE_BY, done_at: DONE_AT }]);
  });

  it("keep the first completion of a refund however many times one arrives", async () => {
    await savePulledChanges(replica, completionChange(1));
    await savePulledChanges(
      replica,
      completionChange(2, { done_by: "other-user", done_at: "2026-10-11T09:00:00.000Z" }),
    );
    await replica.saveRedeliveredPage("refund_completion", {
      changes: [completionChange(3, { done_by: "another", done_at: "2026-10-12T09:00:00.000Z" })],
      cursor: 3,
      hasMore: false,
    });

    expect(completions()).toEqual([{ refund_id: REFUND_ID, done_by: DONE_BY, done_at: DONE_AT }]);
  });

  it("are kept for a refund the register does not hold yet, and show it done once the register records it", async () => {
    await savePulledChanges(replica, completionChange(1));

    recordRefundOfTransferSale(REFUND_ID);

    expect(refundsWithTheirCompletion()).toEqual([
      { id: REFUND_ID, state: "PENDING", done_by: DONE_BY, done_at: DONE_AT },
    ]);
  });

  it("never turn a refund back to pending when they are pulled again after the register records it", async () => {
    await savePulledChanges(replica, completionChange(1));
    recordRefundOfTransferSale(REFUND_ID);

    await savePulledChanges(replica, completionChange(2));

    expect(completions()).toHaveLength(1);
    expect(refundsWithTheirCompletion()).toEqual([
      { id: REFUND_ID, state: "PENDING", done_by: DONE_BY, done_at: DONE_AT },
    ]);
  });

  it("leave a refund the cloud did not mark done pending", async () => {
    await savePulledChanges(replica, completionChange(1, undefined, "another-refund"));

    recordRefundOfTransferSale(REFUND_ID);

    expect(refundsWithTheirCompletion()).toEqual([
      { id: REFUND_ID, state: "PENDING", done_by: null, done_at: null },
    ]);
  });
});
