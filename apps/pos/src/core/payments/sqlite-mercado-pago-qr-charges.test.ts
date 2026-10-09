import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteMercadoPagoQrCharges } from "./sqlite-mercado-pago-qr-charges";

const OCCURRED_AT = "2026-10-09T12:00:00.000Z";
const WAIT_ENDS_AT = "2026-10-09T12:03:00.000Z";

let database: LocalDatabase;
let charges: SqliteMercadoPagoQrCharges;

function addQrPayment(id: string, state: string): void {
  database
    .prepare(
      `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
       VALUES (?, 'sale-1', 'SALE', 'QR', 'MERCADOPAGO_QR', 5000, ?, ?, ?)`,
    )
    .run(id, state, OCCURRED_AT, WAIT_ENDS_AT);
}

function stateOf(id: string): unknown {
  return database.prepare("SELECT state FROM payment_transactions WHERE id = ?").get(id);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '${OCCURRED_AT}', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
     VALUES ('cash-1', 'sale-1', 'SALE', 'CASH', 'NONE', 1000, 1000, 'APPROVED', '${OCCURRED_AT}');`,
  );
  charges = new SqliteMercadoPagoQrCharges(database);
});

afterEach(() => {
  database.close();
});

describe("the Mercado Pago QR charges the register keeps", () => {
  it("find a pending QR payment with its sale, amount and the end of its wait", () => {
    addQrPayment("qr-1", "PENDING");

    expect(charges.pendingCharge("qr-1")).toEqual({
      paymentTransactionId: "qr-1",
      saleId: "sale-1",
      amount: 5000,
      waitEndsAt: new Date(WAIT_ENDS_AT),
    });
  });

  it("find no pending charge for an unknown payment, a QR payment that ended or a cash payment", () => {
    addQrPayment("qr-approved", "APPROVED");
    addQrPayment("qr-declined", "DECLINED");

    expect(charges.pendingCharge("missing")).toBeNull();
    expect(charges.pendingCharge("qr-approved")).toBeNull();
    expect(charges.pendingCharge("qr-declined")).toBeNull();
    expect(charges.pendingCharge("cash-1")).toBeNull();
  });

  it.each(["DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "record a pending QR payment as %s once its order ends that way",
    (state) => {
      addQrPayment("qr-1", "PENDING");

      charges.recordEnded("qr-1", state);

      expect(stateOf("qr-1")).toEqual({ state });
      expect(charges.pendingCharge("qr-1")).toBeNull();
    },
  );

  it("leave a QR payment that is no longer pending as it is", () => {
    addQrPayment("qr-1", "APPROVED");

    charges.recordEnded("qr-1", "DECLINED");

    expect(stateOf("qr-1")).toEqual({ state: "APPROVED" });
  });
});
