import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRealTimeAuthorization,
  settleInterruptedAuthorizations,
} from "../fiscal/real-time-authorization-wiring";
import {
  FACTURA_C,
  insertFiscalDocument,
  insertHealthCheck,
  insertSaleCompletedEvent,
} from "../fiscal/test-support/real-time-authorization-database";
import { scriptedDeferrals } from "../fiscal/test-support/scripted-deferrals";
import type { CloudClientDeps } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteReceiptPrinterSettings } from "../register/sqlite-receipt-printer-settings";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { createReceiptPrinting } from "./receipt-printing-wiring";
import { insertCreditNote } from "./test-support/credit-note-receipt-database";
import { printoutOf } from "./test-support/escpos-printout";
import { ScriptedSocket } from "./test-support/scripted-socket";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const COMPLETED_AT = "2026-10-08T11:59:00.000Z";
const READY = 0x12;
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

describe("the register's receipt printing without a local database", () => {
  const printing = createReceiptPrinting({
    database: undefined,
    gate: undefined,
    now: () => new Date(),
    ids: { next: () => "id" },
    readOutboxChainKey: async () => undefined,
    signedInUserId: () => undefined,
    beforePrinting: async () => undefined,
    reportFailure: () => {},
    syncNow: () => {},
  });

  it("offers no request to answer", () => {
    expect(printing.receiptPrintStatus).toBeUndefined();
    expect(printing.reprintSaleReceipt).toBeUndefined();
    expect(printing.printCreditNote).toBeUndefined();
  });

  it("prints no credit note right after a void", async () => {
    await expect(printing.printVoidedSaleCreditNote("sale-1")).resolves.toBeUndefined();
  });

  it("leaves a charge as it is", () => {
    const charge = async () => ({ kind: "completed", sale_id: "sale-1" });

    expect(printing.afterCompletedSale(charge)).toBe(charge);
  });

  it("leaves a follow of several charges as it is", () => {
    const follow = async () => ({ followed: [], failures: [] });

    expect(printing.afterEachCompletedSale(follow)).toBe(follow);
  });
});

describe("the register's receipt printing over its local database", () => {
  let database: LocalDatabase;
  let connections: { port: number; host: string; socket: ScriptedSocket }[];
  let syncs: number;
  let idCount: number;

  function printingOverDatabase(beforePrinting?: (saleId: string) => Promise<void>) {
    const signedInPerson = createSignedInPerson();
    signedInPerson.set("cashier");
    return createReceiptPrinting({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => Buffer.alloc(32, 7).toString("base64url"),
        hashPin: async () => "hash-of-another-pin",
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
      connectPrinter: (port, host) => {
        const socket = new ScriptedSocket();
        connections.push({ port, host, socket });
        return socket;
      },
      beforePrinting: beforePrinting ?? (async () => undefined),
      reportFailure: () => {},
      syncNow: () => {
        syncs += 1;
      },
    });
  }

  function saveAddress(host: string, port: number | null): void {
    new SqliteReceiptPrinterSettings(database).saveReceiptPrinterAddress({ host, port });
  }

  beforeEach(() => {
    database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    database.exec(
      `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
       UPDATE sync_state SET device_id = 'device-1';
       INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
       VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);
       INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-cashier', 'Cajera', 0, 1);
       INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-cashier', 'sell_and_charge', 1);
       INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('s1', 'r1', 'device-1', 'cashier', '2026-10-08T08:00:00.000Z', 0, 'OPEN');
       INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
       VALUES ('sale-1', 'r1', 'device-1', 's1', 'cashier', 'COMPLETED', '${COMPLETED_AT}', 482);
       INSERT INTO products (id, name, category_id, sale_unit, active, version)
       VALUES ('p1', 'Yerba', 'c', 'UNIT', 1, 1);
       INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, promotion_id, discount_amount, line_total)
       VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 2, 1500, 'list-1', NULL, 0, 3000);
       INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
       VALUES ('pay-1', 'sale-1', 'SALE', 'CASH', 'NONE', 3000, 3000, NULL, NULL, 'APPROVED', '${COMPLETED_AT}');`,
    );
    database
      .prepare(
        "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('cashier', 'Ada', 'role-cashier', ?, 1, 1)",
      )
      .run(encodePinHash(new Uint8Array(16).fill(1)));
    connections = [];
    syncs = 0;
    idCount = 0;
  });

  afterEach(() => {
    database.close();
  });

  it("prints the receipt of the sale a charge completed, after answering it, and then syncs", async () => {
    saveAddress("10.10.10.2", null);
    const charge = vi.fn(async () => ({ kind: "completed", sale_id: "sale-1" }));
    const charging = printingOverDatabase().afterCompletedSale(charge);

    expect(await charging?.({})).toEqual({ kind: "completed", sale_id: "sale-1" });

    await vi.waitFor(() => expect(connections).toHaveLength(1));
    await vi.waitFor(() => expect(syncs).toBe(1));
  });

  it("prints the receipt of a sale a follow of several charges completed, after answering it, and then syncs", async () => {
    saveAddress("10.10.10.2", null);
    const authorized: string[] = [];
    const followed = {
      followed: [
        {
          paymentTransactionId: "qr-1",
          outcome: { kind: "completed", sale_id: "sale-1", total: 3000 },
        },
      ],
      failures: [],
    };
    const following = printingOverDatabase(async (saleId) => {
      authorized.push(saleId);
    }).afterEachCompletedSale(async () => followed);

    expect(await following?.(undefined)).toBe(followed);

    await vi.waitFor(() => expect(connections).toHaveLength(1));
    await vi.waitFor(() => expect(syncs).toBe(1));
    expect(authorized).toEqual(["sale-1"]);
  });

  it("connects to the saved address, on the printer's default port when it has none", async () => {
    saveAddress("10.10.10.2", null);
    const charging = printingOverDatabase().afterCompletedSale(async () => ({
      kind: "completed",
      sale_id: "sale-1",
    }));

    await charging?.({});

    await vi.waitFor(() => expect(connections).toHaveLength(1));
    expect(connections[0]).toMatchObject({ host: "10.10.10.2", port: 9100 });
  });

  it("connects to nothing and says the printer is not configured while no address is saved, leaving the sale as it is", async () => {
    const printing = printingOverDatabase();
    const charging = printing.afterCompletedSale(async () => ({
      kind: "completed",
      sale_id: "sale-1",
    }));

    expect(await charging?.({})).toEqual({ kind: "completed", sale_id: "sale-1" });

    await vi.waitFor(() => expect(syncs).toBe(1));
    expect(connections).toEqual([]);
    expect(await printing.receiptPrintStatus?.("sale-1")).toMatchObject({
      printed: false,
      standing: "printer_not_configured",
    });
    expect(database.prepare("SELECT state FROM sales WHERE id = 'sale-1'").get()).toEqual({
      state: "COMPLETED",
    });
  });

  it("prints the next receipt to the address saved after the register started, without restarting it", async () => {
    const charging = printingOverDatabase().afterCompletedSale(async () => ({
      kind: "completed",
      sale_id: "sale-1",
    }));
    await charging?.({});
    await vi.waitFor(() => expect(syncs).toBe(1));

    saveAddress("10.10.10.9", 9101);
    await charging?.({});

    await vi.waitFor(() => expect(connections).toHaveLength(1));
    expect(connections[0]).toMatchObject({ host: "10.10.10.9", port: 9101 });
  });

  describe("a receipt waiting for paper", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("goes out on the address saved while it waits, and never on the one it waited at", async () => {
      saveAddress("10.10.10.2", null);
      const printing = printingOverDatabase();
      await printing.afterCompletedSale(async () => ({ kind: "completed", sale_id: "sale-1" }))?.(
        {},
      );
      await vi.waitFor(() => expect(connections).toHaveLength(1));
      const [old] = connections;
      old?.socket.connected();
      old?.socket.receive(0x32);
      expect(await printing.receiptPrintStatus?.("sale-1")).toMatchObject({
        printed: false,
        standing: "paper_out",
      });

      saveAddress("10.10.10.9", 9101);
      await vi.advanceTimersByTimeAsync(500);

      expect(connections).toHaveLength(2);
      const replacement = connections[1];
      expect(replacement).toMatchObject({ host: "10.10.10.9", port: 9101 });
      replacement?.socket.connected();
      replacement?.socket.receive(0x12);

      await vi.waitFor(async () =>
        expect(await printing.receiptPrintStatus?.("sale-1")).toMatchObject({
          next_copy: { kind: "duplicate", order_number: 1 },
          printed: true,
          standing: "printed",
        }),
      );
      expect(replacement?.socket.written).toHaveLength(1);
      expect(old?.socket.written).toEqual([]);
      expect(old?.socket.destroyed).toBe(true);
    });

    it("leaves the sale's receipt as the original until the printer is ready", async () => {
      saveAddress("10.10.10.2", null);
      const printing = printingOverDatabase();
      await printing.afterCompletedSale(async () => ({ kind: "completed", sale_id: "sale-1" }))?.(
        {},
      );
      await vi.waitFor(() => expect(connections).toHaveLength(1));
      connections[0]?.socket.connected();
      connections[0]?.socket.receive(0x32);

      expect(await printing.receiptPrintStatus?.("sale-1")).toEqual({
        kind: "found",
        next_copy: { kind: "original" },
        printed: false,
        standing: "paper_out",
        comprobante: { kind: "none" },
      });
      expect(
        database.prepare("SELECT print_attempted_at FROM sales WHERE id = 'sale-1'").get(),
      ).toEqual({
        print_attempted_at: null,
      });
    });
  });

  it("prints nothing for a charge that completed no sale", async () => {
    const charging = printingOverDatabase().afterCompletedSale(async () => ({
      kind: "partially_paid",
    }));

    expect(await charging?.({})).toEqual({ kind: "partially_paid" });
    expect(connections).toEqual([]);
    expect(syncs).toBe(0);
  });

  it("answers the print status and the reprint of a sale's receipt", async () => {
    const printing = printingOverDatabase();

    expect(await printing.receiptPrintStatus?.("sale-1")).toEqual({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: null,
      comprobante: { kind: "none" },
    });
    expect(await printing.reprintSaleReceipt?.({ saleId: "sale-1", reason: "Se perdió" })).toEqual({
      kind: "lacks_permission",
    });
  });

  it("reprints a sale never printed before with its line's kept promotion name and discount", async () => {
    database.exec(
      `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-cashier', 'reprint_receipt', 1);
       INSERT INTO discounts (id, name, kind, percent, target_kind, target_id, valid_from, valid_to, weekdays, active, version, removed)
       VALUES ('promo-1', 'Promo 20% en la segunda', 'PERCENT_OFF', 20, 'PRODUCT', 'p1', '2026-09-01', '2026-12-31', '[]', 1, 1, 0);
       UPDATE sale_lines SET promotion_id = 'promo-1', discount_amount = 600, line_total = 2400 WHERE id = 'line-1';
       INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent)
       VALUES ('line-1', 'promo-1', 'Promo 20% en la segunda', 'PERCENT_OFF', 20);
       UPDATE payment_transactions SET amount = 2400, tendered = 2400 WHERE id = 'pay-1';`,
    );
    saveAddress("10.10.10.2", null);

    const reprinted = printingOverDatabase().reprintSaleReceipt?.({
      saleId: "sale-1",
      reason: "Se perdió",
    });
    await vi.waitFor(() => expect(connections).toHaveLength(1));
    const [connection] = connections;
    connection?.socket.connected();
    connection?.socket.receive(READY);

    expect(await reprinted).toEqual({ kind: "started", copy: { kind: "original" } });
    const [written] = connection?.socket.written ?? [];
    const paper = printoutOf(written ?? new Uint8Array());
    expect(paper.textLines).toContain("  Promo 20% en la segunda                -$ 6,00");
  });

  describe("the credit note of a voided sale", () => {
    beforeEach(() => {
      database.exec(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-cashier', 'view_sales_history', 1);
         UPDATE sales SET state = 'VOIDED', voided_at = '2026-10-08T11:59:30.000Z' WHERE id = 'sale-1';`,
      );
      insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
      insertCreditNote(database);
      saveAddress("10.10.10.2", null);
    });

    it("is printed on the printer right after the void, without anyone asking", async () => {
      await printingOverDatabase().printVoidedSaleCreditNote("sale-1");

      await vi.waitFor(() => expect(connections).toHaveLength(1));
      const [connection] = connections;
      connection?.socket.connected();
      connection?.socket.receive(READY);
      await vi.waitFor(() => expect(connection?.socket.written).toHaveLength(1));
      expect(printoutOf(connection?.socket.written[0] ?? new Uint8Array()).text).toContain(
        "NOTA DE CRÉDITO C",
      );
    });

    it("is printed again from the history, answering that it started", async () => {
      const printing = printingOverDatabase();

      const reprinted = printing.printCreditNote?.("sale-1");
      await vi.waitFor(() => expect(connections).toHaveLength(1));
      const [connection] = connections;
      connection?.socket.connected();
      connection?.socket.receive(READY);

      expect(await reprinted).toEqual({ kind: "started" });
      expect(printoutOf(connection?.socket.written[0] ?? new Uint8Array()).text).toContain(
        "Asociada a Factura C",
      );
    });
  });

  describe("a charge whose sale has a fiscal document", () => {
    const QR_URL = "https://www.arca.gob.ar/fe/qr/?p=";
    const AUTHORIZED_ANSWER = {
      state: "AUTHORIZED",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-10",
    };

    function json(body: unknown): Response {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    function cloudAnswering(answer: () => Promise<Response>): CloudClientDeps {
      return {
        cloudUrl: "https://staging.purosur.online",
        fetch: async () => answer(),
        sleep: async () => undefined,
      };
    }

    function insertDocumentWaiting(): void {
      insertSaleCompletedEvent(database, "sale-1");
      insertFiscalDocument(database);
      insertHealthCheck(database);
    }

    function chargingWith(
      cloud: CloudClientDeps | undefined,
      readDeviceToken: () => Promise<string | undefined> = async () => "prefix.secret",
    ) {
      const authorization = createRealTimeAuthorization({
        database,
        cloudClient: cloud,
        readDeviceToken,
        now: () => NOW,
        ...scriptedDeferrals(),
        readOutboxChainKey: async () => CHAIN_KEY,
        reportFailure: () => {},
      });
      return printingOverDatabase(authorization.authorizeSale).afterCompletedSale(async () => ({
        kind: "completed",
        sale_id: "sale-1",
      }));
    }

    async function printedPapers() {
      await vi.waitFor(() => expect(syncs).toBe(1));
      return connections.map(({ socket }) => {
        socket.connected();
        socket.receive(READY);
        const [written] = socket.written;
        return printoutOf(written ?? new Uint8Array());
      });
    }

    beforeEach(() => {
      saveAddress("10.10.10.2", null);
    });

    it("prints exactly one paper, the factura C with its authorization code and its QR, once the tax authority authorizes it", async () => {
      insertDocumentWaiting();

      await chargingWith(cloudAnswering(async () => json(AUTHORIZED_ANSWER)))?.({});
      const papers = await printedPapers();

      expect(papers).toHaveLength(1);
      expect(papers[0]?.textLines.some((line) => line.startsWith("Comercio de Prueba "))).toBe(
        true,
      );
      expect(papers[0]?.textLines).toContain("             CAE 75123456789012  ·  Vto. 10/10/2026");
      const store = papers[0]?.text.match(/\[qr store (.*)\]/)?.[1] ?? "";
      expect(JSON.parse(atob(store.slice(QR_URL.length)))).toMatchObject({
        cuit: 20000000001,
        tipoCmp: 11,
        nroCmp: 41,
        importe: FACTURA_C.total / 100,
        codAut: 75123456789012,
      });
    });

    it("answers the cashier before the tax authority answers, and prints only after it did", async () => {
      insertDocumentWaiting();
      const pendingAnswers: ((response: Response) => void)[] = [];
      const cloud = cloudAnswering(
        () =>
          new Promise<Response>((resolve) => {
            pendingAnswers.push(resolve);
          }),
      );

      const outcome = await chargingWith(cloud)?.({});
      await vi.waitFor(() => expect(pendingAnswers).toHaveLength(1));

      expect(outcome).toEqual({ kind: "completed", sale_id: "sale-1" });
      expect(connections).toEqual([]);
      expect(syncs).toBe(0);

      pendingAnswers[0]?.(json(AUTHORIZED_ANSWER));
      const papers = await printedPapers();
      expect(papers).toHaveLength(1);
      expect(papers[0]?.textLines).toContain("             CAE 75123456789012  ·  Vto. 10/10/2026");
    });

    it.each([
      [
        "the tax authority rejects it",
        () =>
          cloudAnswering(async () =>
            json({ state: "REJECTED", rejection_codes: [10015], rejection_class: "content" }),
          ),
      ],
      ["the answer is unclear", () => cloudAnswering(async () => json({ state: "UNCLEAR" }))],
      [
        "the tax authority is not asked",
        () => cloudAnswering(async () => json({ state: "NOT_ATTEMPTED" })),
      ],
      [
        "the cloud cannot be reached",
        () =>
          cloudAnswering(async () => {
            throw new TypeError("fetch failed");
          }),
      ],
      ["the register has no cloud", () => undefined],
    ])("prints once the non-fiscal document of the deferred sale when %s", async (_case, cloud) => {
      insertDocumentWaiting();

      await chargingWith(cloud())?.({});
      const papers = await printedPapers();

      expect(papers).toHaveLength(1);
      expect(papers[0]?.textLines).toContain("Yerba");
      expect(papers[0]?.text).toContain("DOCUMENTO NO VALIDO COMO FACTURA");
      expect(papers[0]?.text).toContain("Código de consulta");
      expect(papers[0]?.text).toContain("[qr store purosur-deferred-sale:");
      expect(papers[0]?.text).not.toContain("FACTURA C");
    });

    it("still prints the receipt as before, once, when the sale has no fiscal document", async () => {
      await chargingWith(cloudAnswering(async () => json({})))?.({});
      const papers = await printedPapers();

      expect(papers).toHaveLength(1);
      expect(papers[0]?.textLines).toContain("Yerba");
      expect(papers[0]?.text).not.toContain("FACTURA C");
      expect(papers[0]?.text).not.toContain("[qr");
    });

    it("prints the deferred sale's document on a reprint once the register restarts after stopping while the tax authority was asked", async () => {
      insertDocumentWaiting();
      database
        .prepare(
          "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-cashier', 'reprint_receipt', 1)",
        )
        .run();
      await settleInterruptedAuthorizations({
        database,
        now: () => NOW,
        reportFailure: () => {},
        ...scriptedDeferrals(),
        readOutboxChainKey: async () => CHAIN_KEY,
      });

      const reprinted = printingOverDatabase().reprintSaleReceipt?.({
        saleId: "sale-1",
        reason: "Se perdió",
      });
      await vi.waitFor(() => expect(connections).toHaveLength(1));
      const [connection] = connections;
      connection?.socket.connected();
      connection?.socket.receive(READY);

      expect(await reprinted).toEqual({ kind: "started", copy: { kind: "original" } });
      const [written] = connection?.socket.written ?? [];
      const paper = printoutOf(written ?? new Uint8Array());
      expect(paper.textLines).toContain("Yerba");
      expect(paper.text).toContain("DOCUMENTO NO VALIDO COMO FACTURA");
      expect(paper.text).not.toContain("FACTURA C");
    });

    it("prints once the deferred sale's document when asking the tax authority fails", async () => {
      insertDocumentWaiting();

      await chargingWith(
        cloudAnswering(async () => json(AUTHORIZED_ANSWER)),
        async () => {
          throw new Error("the credentials cannot be read");
        },
      )?.({});
      const papers = await printedPapers();

      expect(papers).toHaveLength(1);
      expect(papers[0]?.text).toContain("DOCUMENTO NO VALIDO COMO FACTURA");
      expect(papers[0]?.text).not.toContain("FACTURA C");
    });
  });
});
