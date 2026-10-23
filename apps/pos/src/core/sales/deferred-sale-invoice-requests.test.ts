import { encodePinHash } from "@purosur/contracts";
import type { DeferredSaleInvoicing } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  type DeferredSaleInvoiceRequestDeps,
  findDeferredSaleFor,
  printDeferredSaleInvoiceFor,
} from "./deferred-sale-invoice-requests";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const SOLD_AT = "2026-10-07T11:59:00.000Z";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let invoicing: { invoiceUpTo: ReturnType<typeof vi.fn> } & DeferredSaleInvoicing;
let jobs: ReturnType<typeof createReceiptPrintJobs>;

function deps(): DeferredSaleInvoiceRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => "hash-of-a-pin",
      now: () => NOW,
    }),
    now: () => NOW,
    ids: { next: () => "id-1" },
    readOutboxChainKey: async () => CHAIN_KEY,
    signedInUserId: () => signedInPerson.userId(),
    printers: { configured: () => new ControllableReceiptPrinter() },
    jobs,
    invoicing,
  };
}

function addPerson(id: string, permissions: string[]): void {
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
    .run(id, id, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(
      id,
      derivePinVerifier(PEPPER, "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu"),
    );
}

function addDeferredSale(saleId: string, shortCode: string, { occurredAt = SOLD_AT } = {}): void {
  database.exec(
    `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
     VALUES ('${saleId}', 'r1', 'device-1', 's1', 'cashier', 'COMPLETED', '${occurredAt}', (SELECT 482 + count(*) FROM sales));
     INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
     VALUES ('deferred-of-${saleId}', '${saleId}', '${occurredAt}', 3000, 'fiscally_offline', '${shortCode}', '${occurredAt}');`,
  );
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';`,
  );
  addPerson("cashier", ["sell_and_charge"]);
  addPerson("clerk", ["view_sales_history"]);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'cashier', '2026-10-07T08:00:00.000Z', 0, 'OPEN');`,
  );
  signedInPerson = createSignedInPerson();
  signedInPerson.set("cashier");
  invoicing = { invoiceUpTo: vi.fn(async () => ({ kind: "invoiced" as const })) };
  jobs = createReceiptPrintJobs({ reportFailure: () => undefined });
});

afterEach(() => {
  database.close();
});

describe("finding a deferred sale for a customer who returns", () => {
  it("answers the sale a typed short code belongs to, not yet invoiced", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");

    expect(
      await findDeferredSaleFor(deps(), { kind: "short_code", shortCode: "7KQ4M2P9" }),
    ).toEqual({
      kind: "found",
      sale_id: "sale-1",
      occurred_at: SOLD_AT,
      total: 3000,
      short_code: "7KQ4M2P9",
      invoice: { kind: "pending" },
      original_printed: false,
    });
  });

  it("answers the sale a scanned reference belongs to", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");

    expect(
      await findDeferredSaleFor(deps(), {
        kind: "reference",
        id: "deferred-of-sale-1",
        shortCode: "7KQ4M2P9",
      }),
    ).toMatchObject({ kind: "found", sale_id: "sale-1" });
  });

  it("answers that no deferred sale has the code", async () => {
    expect(
      await findDeferredSaleFor(deps(), { kind: "short_code", shortCode: "7KQ4M2P9" }),
    ).toEqual({ kind: "not_found" });
  });

  it("answers that a voided sale was voided", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    database.exec(
      "UPDATE sales SET state = 'VOIDED', voided_at = '2026-10-07T12:30:00.000Z' WHERE id = 'sale-1'",
    );

    expect(
      await findDeferredSaleFor(deps(), { kind: "short_code", shortCode: "7KQ4M2P9" }),
    ).toEqual({ kind: "voided" });
  });

  it("answers that a sale left too long without an invoice expired", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9", { occurredAt: "2026-01-02T12:00:00.000Z" });

    expect(
      await findDeferredSaleFor(deps(), { kind: "short_code", shortCode: "7KQ4M2P9" }),
    ).toEqual({ kind: "expired" });
  });

  it("answers nothing about a sale when nobody is signed in", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    signedInPerson.clear();

    expect(
      await findDeferredSaleFor(deps(), { kind: "short_code", shortCode: "7KQ4M2P9" }),
    ).toEqual({ kind: "not_signed_in" });
  });

  it("answers nothing about a sale to someone who may not sell", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    signedInPerson.set("clerk");

    expect(
      await findDeferredSaleFor(deps(), { kind: "short_code", shortCode: "7KQ4M2P9" }),
    ).toEqual({ kind: "lacks_permission" });
  });
});

describe("printing a deferred sale's invoice as an original", () => {
  it("answers that the sale is not found without invoicing anything", async () => {
    expect(await printDeferredSaleInvoiceFor(deps(), "sale-9")).toEqual({ kind: "not_found" });
    expect(invoicing.invoiceUpTo).not.toHaveBeenCalled();
  });

  it("answers that a voided sale was voided without invoicing anything", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    database.exec(
      "UPDATE sales SET state = 'VOIDED', voided_at = '2026-10-07T12:30:00.000Z' WHERE id = 'sale-1'",
    );

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({ kind: "voided" });
    expect(invoicing.invoiceUpTo).not.toHaveBeenCalled();
  });

  it("answers that an expired sale expired without invoicing anything", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9", { occurredAt: "2026-01-02T12:00:00.000Z" });

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({ kind: "expired" });
    expect(invoicing.invoiceUpTo).not.toHaveBeenCalled();
  });

  it("asks to invoice the backlog up to the sale and prints nothing when it cannot be invoiced yet", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoicing.invoiceUpTo.mockResolvedValue({ kind: "not_yet", cause: "older_sale_blocking" });

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "not_yet",
      cause: "older_sale_blocking",
    });
    expect(invoicing.invoiceUpTo).toHaveBeenCalledWith("sale-1");
    expect(database.prepare("SELECT * FROM deferred_invoice_prints").all()).toEqual([]);
  });

  it("answers that the invoice cannot be printed now when invoicing fails", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoicing.invoiceUpTo.mockRejectedValue(new Error("the credentials could not be read"));

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({ kind: "unavailable" });
  });

  it("invoices nothing when nobody is signed in", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    signedInPerson.clear();

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "not_signed_in",
    });
    expect(invoicing.invoiceUpTo).not.toHaveBeenCalled();
  });

  it("invoices nothing for someone who may not sell", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    signedInPerson.set("clerk");

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "lacks_permission",
    });
    expect(invoicing.invoiceUpTo).not.toHaveBeenCalled();
  });

  it("answers busy while the invoice of the same sale is being started", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    void jobs.start("deferred-invoice:sale-1", () => new Promise(() => undefined));

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({ kind: "busy" });
  });
});
