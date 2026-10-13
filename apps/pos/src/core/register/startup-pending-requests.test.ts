import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedChargeRegister } from "../payments/test-support/mercado-pago-charge-requests";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { startupPendingFor } from "./startup-pending-requests";

const NOW = new Date("2026-10-13T12:00:00.000Z");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function gate() {
  return createActionGate({
    store: new SqliteSignInStore(database),
    signedInPerson,
    readPepper: async () => undefined,
    hashPin: async () => "",
    now: () => NOW,
  });
}

function addCompletedSale(
  id: string,
  occurredAt: string,
  lineTotal: number,
  printAttemptedAt: string | null,
  printedAt: string | null,
): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, print_attempted_at, printed_at)
       VALUES (?, 'register-1', 'device-1', 'session-1', 'u1', 'COMPLETED', ?, ?, ?)`,
    )
    .run(id, occurredAt, printAttemptedAt, printedAt);
  database
    .prepare(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       VALUES (?, ?, 1, 'p1', 'Yerba', 1, ?, 'list-1', 0, ?)`,
    )
    .run(`${id}-line`, id, lineTotal, lineTotal);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("what a stopped register left pending", () => {
  it("is empty for a register that left nothing", async () => {
    expect(await startupPendingFor({ database, gate: gate() })).toEqual({
      sales_to_print: [],
      unknown_fiscal_documents: [],
      pending_payments: [],
    });
  });

  it("lists the sales never printed and those with an unknown print outcome, not the printed ones", async () => {
    addCompletedSale("never", "2026-10-13T11:00:00.000Z", 1500, null, null);
    addCompletedSale("unknown", "2026-10-13T11:05:00.000Z", 2500, "2026-10-13T11:06:00.000Z", null);
    addCompletedSale(
      "printed",
      "2026-10-13T11:10:00.000Z",
      3500,
      "2026-10-13T11:11:00.000Z",
      "2026-10-13T11:11:01.000Z",
    );

    expect((await startupPendingFor({ database, gate: gate() })).sales_to_print).toEqual([
      {
        sale_id: "never",
        completed_at: "2026-10-13T11:00:00.000Z",
        total: 1500,
        standing: "never_printed",
      },
      {
        sale_id: "unknown",
        completed_at: "2026-10-13T11:05:00.000Z",
        total: 2500,
        standing: "outcome_unknown",
      },
    ]);
  });

  it("lists the fiscal documents still unknown, with their sale's time and total", async () => {
    addCompletedSale("sale-1", "2026-10-13T11:00:00.000Z", 4200, null, "2026-10-13T11:00:05.000Z");
    database.exec(
      `INSERT INTO fiscal_documents (
         id, sale_id, point_of_sale, document_type, number, issued_on, document, state, reserved_at, resolved_at
       ) VALUES (
         'doc-1', 'sale-1', 12, 'FACTURA_C', 41, '2026-10-13', '{}', 'UNKNOWN',
         '2026-10-13T11:00:01.000Z', '2026-10-13T11:00:02.000Z'
       )`,
    );

    expect((await startupPendingFor({ database, gate: gate() })).unknown_fiscal_documents).toEqual([
      {
        id: "doc-1",
        sale_id: "sale-1",
        completed_at: "2026-10-13T11:00:00.000Z",
        total: 4200,
      },
    ]);
  });

  it("lists the QR and Point payments still pending", async () => {
    database.exec(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
       VALUES ('open-sale', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);
       INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
       VALUES ('qr-1', 'open-sale', 'SALE', 'QR', 'MERCADOPAGO_QR', 3000, 'PENDING',
               '2026-10-13T11:50:00.000Z', '2026-10-13T11:53:00.000Z')`,
    );

    expect((await startupPendingFor({ database, gate: gate() })).pending_payments).toEqual([
      {
        payment_id: "qr-1",
        sale_id: "open-sale",
        method: "QR",
        amount: 3000,
        occurred_at: "2026-10-13T11:50:00.000Z",
      },
    ]);
  });

  it("is refused while nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await startupPendingFor({ database, gate: gate() })).toBe("not_permitted");
  });

  it("is refused to a person who may not sell", async () => {
    database.exec(
      "UPDATE role_permissions SET active = 0 WHERE permission_key = 'sell_and_charge'",
    );

    expect(await startupPendingFor({ database, gate: gate() })).toBe("not_permitted");
  });
});
