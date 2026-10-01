import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { evaluatePreEmissionGateOfCompletedSale } from "./after-sale-completed";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let idCount: number;

const ids = {
  next: () => {
    idCount += 1;
    return `id-${idCount}`;
  },
};

function evaluate(saleId = "sale-1") {
  evaluatePreEmissionGateOfCompletedSale({ database, now: () => NOW, ids }, CHAIN_KEY, saleId);
}

function outcomes() {
  return database
    .prepare("SELECT sale_id, outcome, failure_reason FROM pre_emission_gate_outcomes")
    .all();
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'cashier', '2026-10-01T08:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'cashier', 'COMPLETED', ?)",
    )
    .run(NOW.toISOString());
});

afterEach(() => {
  database.close();
  vi.restoreAllMocks();
});

describe("evaluating the pre-emission gate of a sale that was just completed", () => {
  it("records the outcome and queues the failure of the register", () => {
    evaluate();

    expect(outcomes()).toEqual([
      { sale_id: "sale-1", outcome: "FAILED", failure_reason: "issuer_identification_missing" },
    ]);
    expect(database.prepare("SELECT event_type FROM outbox").all()).toEqual([
      { event_type: "fiscal_gate_failed" },
    ]);
  });

  it("reports an evaluation that could not run and lets the sale stand", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    database.exec("DROP TABLE pre_emission_gate_outcomes");

    expect(() => evaluate()).not.toThrow();
    expect(report).toHaveBeenCalledWith("core: pre-emission gate failed", expect.any(Error));
  });
});
