import { encodePinHash } from "@purosur/contracts";
import type { DeferredSaleInvoicing } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import { insertFiscalDocument } from "../fiscal/test-support/real-time-authorization-database";
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
  reprintDeferredSaleInvoiceFor,
} from "./deferred-sale-invoice-requests";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import { printCompletedSaleReceiptFor, reprintSaleReceiptFor } from "./receipt-requests";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const SOLD_AT = "2026-10-07T11:59:00.000Z";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let invoicing: { invoiceUpTo: ReturnType<typeof vi.fn> } & DeferredSaleInvoicing;
let jobs: ReturnType<typeof createReceiptPrintJobs>;
let printer: ControllableReceiptPrinter;
let idCount: number;

function deps(
  overrides: Partial<DeferredSaleInvoiceRequestDeps> = {},
): DeferredSaleInvoiceRequestDeps {
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
    ticketedSteps: (_operation, _subjectId, operate) => operate((step) => step()),
    invoicing,
    ...overrides,
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
     VALUES ('deferred-of-${saleId}', '${saleId}', '${occurredAt}', 3000, 'fiscally_offline', '${shortCode}', '${occurredAt}');
     INSERT OR IGNORE INTO products (id, name, category_id, sale_unit, active, version)
     VALUES ('p1', 'Yerba del catalogo', 'c', 'UNIT', 1, 1);
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, promotion_id, discount_amount, line_total)
     VALUES ('line-${saleId}', '${saleId}', 1, 'p1', 'Yerba', 2, 1500, 'list-1', NULL, 0, 3000);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-${saleId}', '${saleId}', 'SALE', 'CASH', 'NONE', 3000, 3000, NULL, NULL, 'APPROVED', '${occurredAt}');`,
  );
}

function invoiceSale(saleId: string): void {
  const documentId = `doc-of-${saleId}`;
  insertFiscalDocument(database, { id: documentId, saleId, state: "AUTHORIZED", number: 41 });
  database
    .prepare(
      "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = ?, satisfied_at = ? WHERE sale_id = ?",
    )
    .run(documentId, NOW.toISOString(), saleId);
}

function printedText(index: number): string {
  return Buffer.from(printer.handed[index] ?? []).toString("latin1");
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';`,
  );
  addPerson("cashier", ["sell_and_charge"]);
  addPerson("clerk", ["view_sales_history"]);
  addPerson("supervisor", ["reprint_receipt"]);
  database.exec(
    `INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'cashier', '2026-10-07T08:00:00.000Z', 0, 'OPEN');`,
  );
  signedInPerson = createSignedInPerson();
  signedInPerson.set("cashier");
  invoicing = { invoiceUpTo: vi.fn(async () => ({ kind: "invoiced" as const })) };
  jobs = createReceiptPrintJobs({ reportFailure: () => undefined });
  printer = new ControllableReceiptPrinter();
  idCount = 0;
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

describe("printing a deferred sale's invoice end to end", () => {
  const FACTURA_TEXT = "CAE 75123456789012";
  const NOT_AN_INVOICE_TEXT = "DOCUMENTO NO VALIDO COMO FACTURA";

  function invoicingTheSale(): void {
    invoicing.invoiceUpTo.mockImplementation(async (saleId: string) => {
      invoiceSale(saleId);
      return { kind: "invoiced" as const };
    });
  }

  function invoicePrints(): unknown[] {
    return database
      .prepare("SELECT sale_id, print_attempted_at, printed_at FROM deferred_invoice_prints")
      .all();
  }

  it("starts the factura C of the sale as an original and keeps its print state apart from the sale's", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoicingTheSale();

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "started",
      copy: { kind: "original" },
    });
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("deferred-invoice:sale-1")).toBe("printed"));

    expect(printedText(0)).toContain(FACTURA_TEXT);
    expect(printedText(0)).not.toContain(NOT_AN_INVOICE_TEXT);
    expect(invoicePrints()).toEqual([
      { sale_id: "sale-1", print_attempted_at: NOW.toISOString(), printed_at: NOW.toISOString() },
    ]);
    expect(
      database
        .prepare("SELECT print_attempted_at, printed_at FROM sales WHERE id = 'sale-1'")
        .get(),
    ).toEqual({ print_attempted_at: null, printed_at: null });
    expect(database.prepare("SELECT count(*) AS count FROM sale_receipts").get()).toEqual({
      count: 0,
    });
  });

  it("answers already_printed once the original was attempted, printing nothing more", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoicingTheSale();
    await printDeferredSaleInvoiceFor(deps(), "sale-1");
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("deferred-invoice:sale-1")).toBe("printed"));

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "already_printed",
    });
    expect(printer.waiting).toHaveLength(1);
    expect(database.prepare("SELECT count(*) AS count FROM sale_reprints").get()).toEqual({
      count: 0,
    });
  });

  it("answers printer_not_configured and records no attempt, so a later print is still the original", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoicingTheSale();

    expect(
      await printDeferredSaleInvoiceFor(
        deps({ printers: { configured: () => undefined } }),
        "sale-1",
      ),
    ).toEqual({ kind: "printer_not_configured" });
    expect(invoicePrints()).toEqual([]);

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "started",
      copy: { kind: "original" },
    });
  });

  it("prints as an original a sale the backlog catch-up already invoiced but never printed", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoiceSale("sale-1");

    expect(await printDeferredSaleInvoiceFor(deps(), "sale-1")).toEqual({
      kind: "started",
      copy: { kind: "original" },
    });
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("deferred-invoice:sale-1")).toBe("printed"));

    expect(invoicing.invoiceUpTo).not.toHaveBeenCalled();
    expect(printedText(0)).toContain(FACTURA_TEXT);
  });

  it("leaves the sale's own ticket as it was printed when its duplicate comes out after the sale was invoiced", async () => {
    addDeferredSale("sale-1", "7KQ4M2P9");
    await printCompletedSaleReceiptFor(deps(), "sale-1");
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("sale-1")).toBe("printed"));
    invoiceSale("sale-1");
    signedInPerson.set("supervisor");

    await reprintSaleReceiptFor(deps(), { saleId: "sale-1", reason: "el cliente la perdió" });
    printer.becomeReady();
    await vi.waitFor(() => expect(printer.handed).toHaveLength(2));

    expect(printedText(0)).toContain(NOT_AN_INVOICE_TEXT);
    expect(printedText(1)).toContain(NOT_AN_INVOICE_TEXT);
    expect(printedText(1)).not.toContain(FACTURA_TEXT);
  });
});

describe("reprinting a deferred sale's invoice", () => {
  const REASON = "el cliente la perdió";

  async function printedOriginal(): Promise<void> {
    addDeferredSale("sale-1", "7KQ4M2P9");
    invoiceSale("sale-1");
    await printDeferredSaleInvoiceFor(deps(), "sale-1");
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("deferred-invoice:sale-1")).toBe("printed"));
  }

  it("starts the first duplicate of the factura as it was printed, with its legend, recording the reprint apart from the sale receipt's", async () => {
    await printedOriginal();
    signedInPerson.set("supervisor");

    expect(
      await reprintDeferredSaleInvoiceFor(deps(), { saleId: "sale-1", reason: REASON }),
    ).toEqual({
      kind: "started",
      copy: { kind: "duplicate", order_number: 1 },
    });
    printer.becomeReady();
    await vi.waitFor(() => expect(printer.handed).toHaveLength(2));

    expect(printedText(1)).toContain("COPIA DUPLICADA");
    expect(printedText(1)).toContain("CAE 75123456789012");
    expect(
      database.prepare("SELECT document, order_number, reason_text FROM sale_reprints").all(),
    ).toEqual([{ document: "deferred_invoice", order_number: 1, reason_text: REASON }]);
  });

  it("asks another person's authorization from a cashier who may not reprint", async () => {
    await printedOriginal();

    expect(
      await reprintDeferredSaleInvoiceFor(deps(), { saleId: "sale-1", reason: REASON }),
    ).toEqual({
      kind: "lacks_permission",
    });
    expect(printer.waiting).toHaveLength(1);
  });

  it.each([
    ["not invoiced yet", () => addDeferredSale("sale-1", "7KQ4M2P9")],
    [
      "invoiced and never printed",
      () => {
        addDeferredSale("sale-1", "7KQ4M2P9");
        invoiceSale("sale-1");
      },
    ],
  ])(
    "answers original_not_printed, printing and storing nothing, for a factura %s",
    async (_case, arrange) => {
      arrange();
      signedInPerson.set("supervisor");

      expect(
        await reprintDeferredSaleInvoiceFor(deps(), { saleId: "sale-1", reason: REASON }),
      ).toEqual({ kind: "original_not_printed" });
      expect(printer.waiting).toEqual([]);
      expect(printer.handed).toEqual([]);
      expect(database.prepare("SELECT * FROM deferred_invoice_prints").all()).toEqual([]);
      expect(database.prepare("SELECT * FROM sale_reprints").all()).toEqual([]);
    },
  );

  it("answers not_found for a sale the register does not hold", async () => {
    signedInPerson.set("supervisor");

    expect(
      await reprintDeferredSaleInvoiceFor(deps(), { saleId: "sale-9", reason: REASON }),
    ).toEqual({
      kind: "not_found",
    });
  });
});
