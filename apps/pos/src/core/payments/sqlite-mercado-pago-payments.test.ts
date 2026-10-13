import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteMercadoPagoPayments } from "./sqlite-mercado-pago-payments";

let database: LocalDatabase;

function addPayment(
  id: string,
  method: "QR" | "POINT",
  state: string,
  occurredAt = "2026-10-09T12:00:00.000Z",
): void {
  const provider = method === "QR" ? "MERCADOPAGO_QR" : "MERCADOPAGO_POINT";
  database
    .prepare(
      `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
       VALUES (?, 'sale-1', 'SALE', ?, ?, 5000, ?, ?, '2026-10-09T12:03:00.000Z')`,
    )
    .run(id, method, provider, state, occurredAt);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);`,
  );
});

afterEach(() => {
  database.close();
});

describe("the Mercado Pago payments the register keeps", () => {
  it("answer the QR and Point payments in a state, with their sale, method, amount and time, oldest first", () => {
    addPayment("qr-1", "QR", "PENDING", "2026-10-09T12:00:00.000Z");
    addPayment("point-1", "POINT", "PENDING", "2026-10-09T12:05:00.000Z");

    expect(new SqliteMercadoPagoPayments(database).unreplacedPaymentsIn("PENDING")).toEqual([
      {
        paymentId: "qr-1",
        saleId: "sale-1",
        method: "QR",
        amount: 5000,
        occurredAt: new Date("2026-10-09T12:00:00.000Z"),
      },
      {
        paymentId: "point-1",
        saleId: "sale-1",
        method: "POINT",
        amount: 5000,
        occurredAt: new Date("2026-10-09T12:05:00.000Z"),
      },
    ]);
  });

  it("answer the payments in the state asked for", () => {
    addPayment("qr-pending", "QR", "PENDING");
    addPayment("qr-expired", "QR", "EXPIRED");

    expect(
      new SqliteMercadoPagoPayments(database)
        .unreplacedPaymentsIn("EXPIRED")
        .map(({ paymentId }) => paymentId),
    ).toEqual(["qr-expired"]);
  });

  it("leave out the payments in another state, those replaced and those made another way", () => {
    addPayment("qr-approved", "QR", "APPROVED");
    addPayment("qr-expired", "QR", "EXPIRED");
    addPayment("point-declined", "POINT", "DECLINED");
    addPayment("qr-replaced", "QR", "PENDING");
    database.prepare("UPDATE payment_transactions SET replaced = 1 WHERE id = 'qr-replaced'").run();
    database.exec(
      `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
       VALUES ('cash-1', 'sale-1', 'SALE', 'CASH', 'NONE', 1000, 1000, 'APPROVED', '2026-10-09T12:00:00.000Z')`,
    );

    expect(new SqliteMercadoPagoPayments(database).unreplacedPaymentsIn("PENDING")).toEqual([]);
  });
});
