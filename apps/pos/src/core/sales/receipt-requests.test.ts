import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import {
  printCompletedSaleReceiptFor,
  printOriginalReceiptFor,
  type ReceiptRequestDeps,
  receiptPrintStatusFor,
  reprintSaleReceiptFor,
} from "./receipt-requests";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";
import { ReceiptPrintObserver } from "./test-support/receipt-print-watch";

const START = new Date("2026-10-08T12:00:00.000Z");
const COMPLETED_AT = "2026-10-08T11:59:00.000Z";
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const AUTHORIZER_PIN = "1234";
const NO_PRINTERS = { configured: () => undefined };

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let printer: ControllableReceiptPrinter;
let moment: Date;
let failures: unknown[];
let idCount: number;

function advance(ms: number): void {
  moment = new Date(moment.getTime() + ms);
}

function deps(overrides: Partial<ReceiptRequestDeps> = {}): ReceiptRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === AUTHORIZER_PIN ? PIN_HASH : "hash-of-another-pin"),
      now: () => moment,
    }),
    now: () => moment,
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
    readOutboxChainKey: async () => CHAIN_KEY,
    signedInUserId: () => signedInPerson.userId(),
    printers: { configured: () => printer },
    jobs,
    ...overrides,
  };
}

let jobs: ReturnType<typeof createReceiptPrintJobs>;

function addPerson(id: string, firstName: string, permissions: string[]): void {
  database
    .prepare(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-${id}', 'Rol', 0, 1)`,
    )
    .run();
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(`role-${id}`, key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
    )
    .run(id, firstName, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

function addCompletedSale(saleId: string): void {
  database.exec(
    `INSERT OR IGNORE INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'cashier', '2026-10-08T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
     VALUES ('${saleId}', 'r1', 'device-1', 's1', 'cashier', 'COMPLETED', '${COMPLETED_AT}', (SELECT 482 + count(*) FROM sales));
     INSERT OR IGNORE INTO products (id, name, category_id, sale_unit, active, version)
     VALUES ('p1', 'Yerba del catalogo', 'c', 'UNIT', 1, 1);
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, promotion_id, discount_amount, line_total)
     VALUES ('line-${saleId}', '${saleId}', 1, 'p1', 'Yerba', 2, 1500, 'list-1', NULL, 0, 3000);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-${saleId}', '${saleId}', 'SALE', 'CASH', 'NONE', 3000, 3000, NULL, NULL, 'APPROVED', '${COMPLETED_AT}');`,
  );
}

function deliveryOf(saleId: string): unknown {
  return database
    .prepare("SELECT print_attempted_at, printed_at FROM sales WHERE id = ?")
    .get(saleId);
}

function reprints(): unknown[] {
  return database
    .prepare(
      "SELECT order_number, requested_by, authorized_by, reason_kind, reason_text FROM sale_reprints ORDER BY order_number",
    )
    .all();
}

async function printedAndSent(saleId = "sale-1"): Promise<void> {
  await printCompletedSaleReceiptFor(deps(), saleId);
  printer.becomeReady();
  await vi.waitFor(() => expect(jobs.standingOf(saleId)).toBe("printed"));
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);`,
  );
  addPerson("cashier", "Ada", ["sell_and_charge"]);
  addPerson("supervisor", "Grace", ["reprint_receipt"]);
  addPerson("clerk", "Linus", ["view_sales_history"]);
  addCompletedSale("sale-1");
  signedInPerson = createSignedInPerson();
  signedInPerson.set("cashier");
  moment = START;
  failures = [];
  idCount = 0;
  printer = new ControllableReceiptPrinter();
  jobs = createReceiptPrintJobs({ reportFailure: (_c, e) => failures.push(e) });
});

afterEach(() => {
  database.close();
});

describe("printing a completed sale's receipt", () => {
  it("records nothing and sends nothing while the printer has not reported paper", async () => {
    await printCompletedSaleReceiptFor(deps(), "sale-1");
    printer.report("paper_out");

    expect(printer.waiting).toHaveLength(1);
    expect(printer.handed).toEqual([]);
    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
    expect(reprints()).toEqual([]);
  });

  it("records the print attempt as it sends the original receipt and the sale as printed once the printer took it", async () => {
    await printCompletedSaleReceiptFor(deps(), "sale-1");

    printer.becomeReady();
    advance(3000);
    await vi.waitFor(() => expect(jobs.standingOf("sale-1")).toBe("printed"));

    expect(printer.handed).toHaveLength(1);
    expect(printer.handed[0]?.length).toBeGreaterThan(0);
    expect(deliveryOf("sale-1")).toEqual({
      print_attempted_at: START.toISOString(),
      printed_at: new Date(START.getTime() + 3000).toISOString(),
    });
    expect(reprints()).toEqual([]);
  });

  it("sends nothing when nobody is signed in", async () => {
    signedInPerson.clear();

    await printCompletedSaleReceiptFor(deps(), "sale-1");

    expect(printer.waiting).toEqual([]);
    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
  });

  it("sends nothing and answers that the print failed when the outbox is not ready", async () => {
    await printCompletedSaleReceiptFor(
      deps({ readOutboxChainKey: async () => undefined }),
      "sale-1",
    );

    expect(printer.waiting).toEqual([]);
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      printed: false,
      standing: "failed",
    });
  });

  it("sends nothing and answers that the print failed when the signed-in person may not sell", async () => {
    signedInPerson.set("clerk");

    await printCompletedSaleReceiptFor(deps(), "sale-1");

    expect(printer.waiting).toEqual([]);
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      printed: false,
      standing: "failed",
    });
  });

  it("records no print attempt and stands as printer_not_configured when no printer is configured, so the later print is still the original", async () => {
    await printCompletedSaleReceiptFor(deps({ printers: NO_PRINTERS }), "sale-1");

    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
    expect(reprints()).toEqual([]);
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toEqual({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "printer_not_configured",
    });
    await printCompletedSaleReceiptFor(deps(), "sale-1");
    expect(printer.waiting).toHaveLength(1);
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      next_copy: { kind: "original" },
      standing: "printing",
    });
  });

  it("reports a failure of the ledger instead of throwing", async () => {
    database.exec("DROP TABLE sale_receipts");

    await printCompletedSaleReceiptFor(deps(), "sale-1");

    expect(failures).toHaveLength(1);
    expect(printer.waiting).toEqual([]);
  });
});

describe("the print status of a sale's receipt", () => {
  it("answers not_found for a sale that is not completed", async () => {
    expect(await receiptPrintStatusFor(deps(), "missing")).toEqual({ kind: "not_found" });
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toEqual({ kind: "not_signed_in" });
  });

  it("answers an original, not printed and standing nowhere for a sale never printed", async () => {
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toEqual({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: null,
    });
  });

  it("answers the original as the next copy and the print as in progress while it waits for the printer", async () => {
    await printCompletedSaleReceiptFor(deps(), "sale-1");

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toEqual({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "printing",
    });
  });

  it.each(["cover_open", "paper_out", "not_responding"] as const)(
    "reports the printer's %s",
    async (status) => {
      await printCompletedSaleReceiptFor(deps(), "sale-1");

      printer.report(status);

      expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({ standing: status });
    },
  );

  it("answers that the print failed, with the original still next, when its receipt could not be prepared", async () => {
    database.exec("DELETE FROM branch_settings");

    await printCompletedSaleReceiptFor(deps(), "sale-1");

    expect(printer.waiting).toEqual([]);
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toEqual({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "failed",
    });
  });

  it("answers printed once the receipt was sent to the printer", async () => {
    await printedAndSent();

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      printed: true,
      standing: "printed",
    });
  });
});

const ABANDONING_PRINTERS: ReceiptRequestDeps["printers"] = {
  configured: () => ({ print: async () => ({ kind: "abandoned" }) }),
};

function jobsRunningUnwatched(): ReceiptRequestDeps["jobs"] {
  return {
    standingOf: () => null,
    start: async (_saleId, run) => ({
      kind: "answered",
      outcome: await run({ watch: new ReceiptPrintObserver().watch, printers: (inner) => inner }),
    }),
  };
}

describe("reprinting a sale's receipt from the history", () => {
  it("starts a reprint whose print the printer abandoned before it was ready", async () => {
    await printedAndSent();
    signedInPerson.set("supervisor");
    const abandoning = { jobs: jobsRunningUnwatched(), printers: ABANDONING_PRINTERS };

    expect(
      await reprintSaleReceiptFor(deps(abandoning), { saleId: "sale-1", reason: REASON }),
    ).toEqual({ kind: "started", copy: { kind: "duplicate", order_number: 1 } });
  });

  const REASON = "el cliente la perdió";

  it("prints a sale never printed as the original", async () => {
    signedInPerson.set("supervisor");

    expect(await reprintSaleReceiptFor(deps(), { saleId: "sale-1", reason: REASON })).toEqual({
      kind: "started",
      copy: { kind: "original" },
    });
    expect(reprints()).toEqual([]);
  });

  it("answers printer_not_configured and records nothing when no printer is configured", async () => {
    signedInPerson.set("supervisor");

    expect(
      await reprintSaleReceiptFor(deps({ printers: NO_PRINTERS }), {
        saleId: "sale-1",
        reason: REASON,
      }),
    ).toEqual({ kind: "printer_not_configured" });
    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
    expect(reprints()).toEqual([]);
  });

  it("records the typed reason for a person who holds the permission", async () => {
    await printedAndSent();
    signedInPerson.set("supervisor");

    const outcome = await reprintSaleReceiptFor(deps(), {
      saleId: "sale-1",
      reason: `  ${REASON} `,
    });
    expect(outcome).toEqual({ kind: "started", copy: { kind: "duplicate", order_number: 1 } });
    await printer.whenWaiting(2);
    printer.becomeReady();

    expect(reprints()).toEqual([
      {
        order_number: 1,
        requested_by: "supervisor",
        authorized_by: null,
        reason_kind: "requested",
        reason_text: REASON,
      },
    ]);
  });

  it("asks another person's authorization from a person without the permission", async () => {
    await printedAndSent();

    expect(await reprintSaleReceiptFor(deps(), { saleId: "sale-1", reason: REASON })).toEqual({
      kind: "lacks_permission",
    });
    expect(printer.waiting).toHaveLength(1);
  });

  it("records who authorized it with the PIN of a person who holds the permission", async () => {
    await printedAndSent();

    expect(
      await reprintSaleReceiptFor(deps(), {
        saleId: "sale-1",
        reason: REASON,
        authorization: { user_id: "supervisor", pin: AUTHORIZER_PIN },
      }),
    ).toEqual({ kind: "started", copy: { kind: "duplicate", order_number: 1 } });
    await printer.whenWaiting(2);
    printer.becomeReady();

    expect(reprints()).toEqual([
      {
        order_number: 1,
        requested_by: "cashier",
        authorized_by: "supervisor",
        reason_kind: "requested",
        reason_text: REASON,
      },
    ]);
  });

  it("refuses a wrong PIN without printing", async () => {
    await printedAndSent();

    const outcome = await reprintSaleReceiptFor(deps(), {
      saleId: "sale-1",
      reason: REASON,
      authorization: { user_id: "supervisor", pin: "0000" },
    });

    expect(outcome).toMatchObject({ kind: "wrong_pin" });
    expect(printer.waiting).toHaveLength(1);
    expect(reprints()).toEqual([]);
  });

  it("refuses the PIN of a person who lacks the permission", async () => {
    await printedAndSent();

    expect(
      await reprintSaleReceiptFor(deps(), {
        saleId: "sale-1",
        reason: REASON,
        authorization: { user_id: "clerk", pin: AUTHORIZER_PIN },
      }),
    ).toEqual({ kind: "lacks_permission" });
  });

  it("refuses a blank reason", async () => {
    signedInPerson.set("supervisor");

    expect(await reprintSaleReceiptFor(deps(), { saleId: "sale-1", reason: "  " })).toEqual({
      kind: "invalid_reason",
      max_length: 200,
    });
    expect(printer.waiting).toEqual([]);
  });

  it("is busy while a print of that sale may still come out", async () => {
    await printCompletedSaleReceiptFor(deps(), "sale-1");
    signedInPerson.set("supervisor");

    expect(await reprintSaleReceiptFor(deps(), { saleId: "sale-1", reason: REASON })).toEqual({
      kind: "busy",
    });
    expect(printer.waiting).toHaveLength(1);
  });

  it("answers not_found for a sale that is not completed", async () => {
    signedInPerson.set("supervisor");

    expect(await reprintSaleReceiptFor(deps(), { saleId: "missing", reason: REASON })).toEqual({
      kind: "not_found",
    });
  });

  it("answers unavailable when the outbox is not ready", async () => {
    signedInPerson.set("supervisor");

    expect(
      await reprintSaleReceiptFor(deps({ readOutboxChainKey: async () => undefined }), {
        saleId: "sale-1",
        reason: REASON,
      }),
    ).toEqual({ kind: "unavailable" });
  });
});

describe("printing a sale's original receipt", () => {
  it("starts the original of a sale never printed for a person who may sell, with no reason and no authorization", async () => {
    expect(await printOriginalReceiptFor(deps(), "sale-1")).toEqual({
      kind: "started",
      copy: { kind: "original" },
    });
    advance(3000);
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("sale-1")).toBe("printed"));

    expect(deliveryOf("sale-1")).toEqual({
      print_attempted_at: START.toISOString(),
      printed_at: new Date(START.getTime() + 3000).toISOString(),
    });
    expect(reprints()).toEqual([]);
  });

  it("starts an original whose print the printer abandoned before it was ready", async () => {
    const abandoning = { jobs: jobsRunningUnwatched(), printers: ABANDONING_PRINTERS };

    expect(await printOriginalReceiptFor(deps(abandoning), "sale-1")).toEqual({
      kind: "started",
      copy: { kind: "original" },
    });
    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
  });

  it("refuses a person who may not sell, even one who may reprint, printing nothing", async () => {
    signedInPerson.set("supervisor");

    expect(await printOriginalReceiptFor(deps(), "sale-1")).toEqual({ kind: "lacks_permission" });
    expect(printer.waiting).toEqual([]);
    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
  });

  it("refuses when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await printOriginalReceiptFor(deps(), "sale-1")).toEqual({ kind: "not_signed_in" });
    expect(printer.waiting).toEqual([]);
  });

  it("answers already_attempted for a sale whose original was already attempted, without printing or recording a reprint", async () => {
    await printedAndSent();

    expect(await printOriginalReceiptFor(deps(), "sale-1")).toEqual({
      kind: "already_attempted",
    });
    expect(printer.waiting).toHaveLength(1);
    expect(reprints()).toEqual([]);
  });

  it("answers printer_not_configured and records nothing when no printer is configured", async () => {
    expect(await printOriginalReceiptFor(deps({ printers: NO_PRINTERS }), "sale-1")).toEqual({
      kind: "printer_not_configured",
    });
    expect(deliveryOf("sale-1")).toEqual({ print_attempted_at: null, printed_at: null });
  });

  it("is busy while a print of that sale may still come out", async () => {
    await printCompletedSaleReceiptFor(deps(), "sale-1");

    expect(await printOriginalReceiptFor(deps(), "sale-1")).toEqual({ kind: "busy" });
    expect(printer.waiting).toHaveLength(1);
  });

  it("answers not_found for a sale that is not completed", async () => {
    expect(await printOriginalReceiptFor(deps(), "missing")).toEqual({ kind: "not_found" });
  });

  it("answers unavailable when the outbox is not ready", async () => {
    expect(
      await printOriginalReceiptFor(deps({ readOutboxChainKey: async () => undefined }), "sale-1"),
    ).toEqual({ kind: "unavailable" });
  });
});
