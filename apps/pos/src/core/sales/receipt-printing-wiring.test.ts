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
import { printoutOf } from "./test-support/escpos-printout";
import { ScriptedSocket } from "./test-support/scripted-socket";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const COMPLETED_AT = "2026-10-08T11:59:00.000Z";
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
    expect(printing.retryReceiptPrint).toBeUndefined();
    expect(printing.reprintSaleReceipt).toBeUndefined();
    expect(printing.withdrawHeldReceipts).toBeUndefined();
  });

  it("leaves a charge as it is", () => {
    const charge = async () => ({ kind: "completed", sale_id: "sale-1" });

    expect(printing.afterCompletedSale(charge)).toBe(charge);
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

  it("asks the printer to clear a receipt it still holds when the held receipts are withdrawn", async () => {
    saveAddress("10.10.10.2", null);
    const printing = printingOverDatabase();
    await printing.afterCompletedSale(async () => ({ kind: "completed", sale_id: "sale-1" }))?.({});
    await vi.waitFor(() => expect(connections).toHaveLength(1));
    const socket = (connections[0] as (typeof connections)[number]).socket;
    socket.connected();
    socket.receive(0x32);

    printing.withdrawHeldReceipts?.();
    socket.receive(0x37, 0x25, 0x00);

    expect(socket.written.map((bytes) => [...bytes])).toContainEqual([
      0x10, 0x14, 0x08, 0x01, 0x03, 0x14, 0x01, 0x06, 0x02, 0x08,
    ]);
    await vi.waitFor(async () =>
      expect(await printing.receiptPrintStatus?.("sale-1")).toMatchObject({
        standing: "withdrawn",
      }),
    );
  });

  it("prints nothing for a charge that completed no sale", async () => {
    const charging = printingOverDatabase().afterCompletedSale(async () => ({
      kind: "partially_paid",
    }));

    expect(await charging?.({})).toEqual({ kind: "partially_paid" });
    expect(connections).toEqual([]);
    expect(syncs).toBe(0);
  });

  it("answers the print status, the retry and the reprint of a sale's receipt", async () => {
    const printing = printingOverDatabase();

    expect(await printing.receiptPrintStatus?.("sale-1")).toEqual({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: null,
    });
    expect(await printing.retryReceiptPrint?.("sale-1")).toEqual({ kind: "not_offered" });
    expect(await printing.reprintSaleReceipt?.({ saleId: "sale-1", reason: "Se perdió" })).toEqual({
      kind: "lacks_permission",
    });
  });

  describe("a charge whose sale has a fiscal document", () => {
    const TRANSMIT_RESPONSE_LENGTH = 11;
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
        const [written] = socket.written;
        return printoutOf((written ?? new Uint8Array()).slice(0, -TRANSMIT_RESPONSE_LENGTH));
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
        true,
      ],
      ["the answer is unclear", () => cloudAnswering(async () => json({ state: "UNCLEAR" })), true],
      [
        "the tax authority is not asked",
        () => cloudAnswering(async () => json({ state: "NOT_ATTEMPTED" })),
        true,
      ],
      [
        "the cloud cannot be reached",
        () =>
          cloudAnswering(async () => {
            throw new TypeError("fetch failed");
          }),
        true,
      ],
      ["the register has no cloud", () => undefined, true],
      ["the sale has no fiscal document", () => cloudAnswering(async () => json({})), false],
    ])("still prints the receipt as before, once, when %s", async (_case, cloud, hasDocument) => {
      if (hasDocument) {
        insertDocumentWaiting();
      }

      await chargingWith(cloud())?.({});
      const papers = await printedPapers();

      expect(papers).toHaveLength(1);
      expect(papers[0]?.textLines).toContain("Yerba");
      expect(papers[0]?.text).not.toContain("FACTURA C");
      expect(papers[0]?.text).not.toContain("[qr");
    });

    it("prints the receipt as before on a reprint once the register restarts after stopping while the tax authority was asked", async () => {
      insertDocumentWaiting();
      database
        .prepare(
          "INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-cashier', 'reprint_receipt', 1)",
        )
        .run();
      await settleInterruptedAuthorizations({ database, now: () => NOW, reportFailure: () => {} });

      const reprinted = printingOverDatabase().reprintSaleReceipt?.({
        saleId: "sale-1",
        reason: "Se perdió",
      });
      await vi.waitFor(() => expect(connections).toHaveLength(1));
      const [connection] = connections;
      connection?.socket.connected();

      expect(await reprinted).toEqual({ kind: "started", copy: { kind: "original" } });
      const [written] = connection?.socket.written ?? [];
      const paper = printoutOf((written ?? new Uint8Array()).slice(0, -TRANSMIT_RESPONSE_LENGTH));
      expect(paper.textLines).toContain("Yerba");
      expect(paper.text).not.toContain("FACTURA C");
    });

    it("still prints the receipt as before, once, when asking the tax authority fails", async () => {
      insertDocumentWaiting();

      await chargingWith(
        cloudAnswering(async () => json(AUTHORIZED_ANSWER)),
        async () => {
          throw new Error("the credentials cannot be read");
        },
      )?.({});
      const papers = await printedPapers();

      expect(papers).toHaveLength(1);
      expect(papers[0]?.text).not.toContain("FACTURA C");
    });
  });
});
