import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uniqueShortCode } from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  type SalesHistoryRequestDeps,
  saleHistoryDetailFor,
  salesHistoryFor,
} from "./sales-history-requests";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const ASK = { session: "all", state: "all", page: 1 } as const;

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(): SalesHistoryRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => "hash-of-a-pin",
      now: () => new Date("2026-10-08T12:00:00.000Z"),
    }),
    zoneRules: fixedZoneRulesSource(),
  };
}

function addPerson(id: string, firstName: string, permissions: string[]): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, 'Rol', 0, 1)")
    .run(`role-${id}`);
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
}

interface SaleSeed {
  id: string;
  occurredAt: string;
  operationNumber: number;
  deferred?: boolean;
  authorizedDocumentNumber?: number;
  state?: "COMPLETED" | "VOIDED";
  session?: string;
  pointCardType?: "DEBIT" | "CREDIT";
}

function addSale({
  id,
  occurredAt,
  operationNumber,
  deferred = false,
  authorizedDocumentNumber,
  state = "COMPLETED",
  session = "s1",
  pointCardType,
}: SaleSeed): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number, voided_at)
       VALUES (?, 'r1', 'device-1', ?, 'clerk', ?, ?, ?, ?)`,
    )
    .run(id, session, state, occurredAt, operationNumber, state === "VOIDED" ? occurredAt : null);
  database
    .prepare(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       VALUES (?, ?, 1, 'p1', 'Yerba', 2, 1500, 'list-1', 0, 3000)`,
    )
    .run(`line-${id}`, id);
  if (pointCardType === undefined) {
    database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES (?, ?, 'SALE', 'CASH', 'NONE', 3000, 3000, 'APPROVED', ?)`,
      )
      .run(`pay-${id}`, id, occurredAt);
  } else {
    database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, card_type, amount, state, occurred_at, wait_ends_at)
         VALUES (?, ?, 'SALE', 'POINT', 'MERCADOPAGO_POINT', ?, 3000, 'APPROVED', ?, ?)`,
      )
      .run(`pay-${id}`, id, pointCardType, occurredAt, occurredAt);
  }
  if (deferred) {
    database
      .prepare(
        `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
         VALUES (?, ?, ?, 3000, 'fiscally_offline', ?, ?)`,
      )
      .run(`deferred-${id}`, id, occurredAt, uniqueShortCode(), occurredAt);
  }
  if (authorizedDocumentNumber !== undefined) {
    database
      .prepare(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES (?, ?, 3, 'factura_c', ?, '2026-10-08', '{}', 'AUTHORIZED', '75123456789012', '2026-10-18', ?, ?)`,
      )
      .run(`doc-${id}`, id, authorizedDocumentNumber, occurredAt, occurredAt);
  }
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'clerk', '2026-10-08T08:00:00.000Z', 0, 'OPEN');`,
  );
  addPerson("clerk", "Linus", ["view_sales_history"]);
  addPerson("cashier", "Ada", ["sell_and_charge"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("clerk");
});

afterEach(() => {
  database.close();
});

describe("the sales history", () => {
  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await salesHistoryFor(deps(), ASK)).toEqual({ kind: "not_signed_in" });
  });

  it("answers lacks_permission to a person who may not view the sales history", async () => {
    signedInPerson.set("cashier");

    expect(await salesHistoryFor(deps(), ASK)).toEqual({ kind: "lacks_permission" });
  });

  it("writes when each sale happened on the clock of the zone rules it is given", async () => {
    addSale({ id: "only", occurredAt: "2026-10-08T15:00:00.000Z", operationNumber: 1 });
    const rules = {
      version: "2026a",
      transitions: [{ from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: 0 }],
    };

    expect(
      await salesHistoryFor({ ...deps(), zoneRules: { zoneRules: () => rules } }, ASK),
    ).toMatchObject({
      kind: "found",
      rows: [{ occurred_at: "2026-10-08T15:00:00.000+00:00" }],
    });
  });

  it("answers the page of rows, the total and the page size, most recent first", async () => {
    addSale({ id: "early", occurredAt: "2026-10-08T09:00:00.000Z", operationNumber: 1 });
    addSale({
      id: "late",
      occurredAt: "2026-10-08T15:00:00.000Z",
      operationNumber: 2,
      authorizedDocumentNumber: 1204,
    });

    expect(await salesHistoryFor(deps(), ASK)).toEqual({
      kind: "found",
      rows: [
        {
          sale_id: "late",
          occurred_at: "2026-10-08T12:00:00.000-03:00",
          comprobante: {
            kind: "fiscal",
            document_type: "factura_c",
            authorization: "real_time",
            point_of_sale: 3,
            number: 1204,
          },
          operation_number: 2,
          payment_methods: ["CASH"],
          total: 3000,
          state: "completed",
        },
        {
          sale_id: "early",
          occurred_at: "2026-10-08T06:00:00.000-03:00",
          comprobante: { kind: "none" },
          operation_number: 1,
          payment_methods: ["CASH"],
          total: 3000,
          state: "completed",
        },
      ],
      total: 2,
      page_size: 50,
    });
  });

  it("shows a deferred sale with its non-fiscal comprobante", async () => {
    addSale({
      id: "offline",
      occurredAt: "2026-10-08T09:00:00.000Z",
      operationNumber: 1,
      deferred: true,
    });

    const answer = await salesHistoryFor(deps(), ASK);

    expect(answer.kind === "found" && answer.rows[0]).toMatchObject({
      comprobante: { kind: "deferred_non_fiscal" },
      state: "deferred",
    });
  });

  it("answers the sales of the state asked", async () => {
    addSale({ id: "plain", occurredAt: "2026-10-08T09:00:00.000Z", operationNumber: 1 });
    addSale({
      id: "offline",
      occurredAt: "2026-10-08T10:00:00.000Z",
      operationNumber: 2,
      deferred: true,
    });

    const answer = await salesHistoryFor(deps(), { ...ASK, state: "deferred" });

    expect(answer.kind === "found" && answer.rows.map(({ sale_id }) => sale_id)).toEqual([
      "offline",
    ]);
  });

  it("shows a voided sale as voided and answers the voided sales when asked for them", async () => {
    addSale({ id: "plain", occurredAt: "2026-10-08T09:00:00.000Z", operationNumber: 1 });
    addSale({
      id: "gone",
      occurredAt: "2026-10-08T10:00:00.000Z",
      operationNumber: 2,
      state: "VOIDED",
    });

    const all = await salesHistoryFor(deps(), ASK);
    const voided = await salesHistoryFor(deps(), { ...ASK, state: "voided" });

    expect(all.kind === "found" && all.rows.map(({ sale_id, state }) => [sale_id, state])).toEqual([
      ["gone", "voided"],
      ["plain", "completed"],
    ]);
    expect(voided.kind === "found" && voided.rows.map(({ sale_id }) => sale_id)).toEqual(["gone"]);
  });

  it("answers the sales of the open session only when asked for it", async () => {
    database.exec(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
       VALUES ('s0', 'r1', 'device-1', 'clerk', '2026-10-07T08:00:00.000Z', 0, 'CLOSED', '2026-10-07T20:00:00.000Z');`,
    );
    addSale({ id: "today", occurredAt: "2026-10-08T09:00:00.000Z", operationNumber: 2 });
    addSale({ id: "yesterday", occurredAt: "2026-10-07T09:00:00.000Z", operationNumber: 1 });
    database.exec("UPDATE sales SET session_id = 's0' WHERE id = 'yesterday'");

    const answer = await salesHistoryFor(deps(), { ...ASK, session: "open" });

    expect(answer.kind === "found" && answer.rows.map(({ sale_id }) => sale_id)).toEqual(["today"]);
  });

  it("skips the pages before the asked one", async () => {
    for (let n = 1; n <= 51; n += 1) {
      addSale({
        id: `sale-${n}`,
        occurredAt: `2026-10-08T${String(Math.floor(n / 60) + 9).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00.000Z`,
        operationNumber: n,
      });
    }

    const answer = await salesHistoryFor(deps(), { ...ASK, page: 2 });

    expect(answer.kind === "found" && answer.rows.map(({ sale_id }) => sale_id)).toEqual([
      "sale-1",
    ]);
    expect(answer.kind === "found" && answer.total).toBe(51);
  });
});

describe("the detail of a sale of the history", () => {
  beforeEach(() => {
    addSale({
      id: "sale-1",
      occurredAt: "2026-10-08T09:00:00.000Z",
      operationNumber: 482,
      authorizedDocumentNumber: 1204,
    });
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await saleHistoryDetailFor(deps(), "sale-1")).toEqual({ kind: "not_signed_in" });
  });

  it("answers lacks_permission to a person who may not view the sales history", async () => {
    signedInPerson.set("cashier");

    expect(await saleHistoryDetailFor(deps(), "sale-1")).toEqual({ kind: "lacks_permission" });
  });

  it("answers not_found for a sale the register does not hold", async () => {
    expect(await saleHistoryDetailFor(deps(), "missing")).toEqual({ kind: "not_found" });
  });

  it("answers the sale's detail with the original as the next printing", async () => {
    expect(await saleHistoryDetailFor(deps(), "sale-1")).toEqual({
      kind: "found",
      detail: {
        sale_id: "sale-1",
        occurred_at: "2026-10-08T06:00:00.000-03:00",
        total: 3000,
        comprobante: {
          kind: "fiscal",
          document_type: "factura_c",
          authorization: "real_time",
          point_of_sale: 3,
          number: 1204,
        },
        operation_number: 482,
        served_by_first_name: "Linus",
        line_count: 1,
        payments: [{ method: "CASH", card_type: null, amount: 3000 }],
        state: "completed",
        voidability: {
          kind: "voidable",
          refunds: [
            {
              method: "CASH",
              card_type: null,
              amount: 3000,
              state: "APPROVED",
              sent_by_cloud: false,
            },
          ],
          credit_note_corrects: { point_of_sale: 3, number: 1204 },
        },
        void_authorization_required: true,
        credit_notes: [],
        reprint: { kind: "available" },
        next_copy: { kind: "original" },
        deferred_invoice_next_copy: null,
        short_code: null,
      },
    });
  });

  it("answers the refunds of an invoiced sale once the register reaches the tax authority", async () => {
    database
      .prepare(
        `INSERT INTO register_health_checks (checked_at, round_trip_ms, token_valid, arca_reachable)
         VALUES (?, 100, 1, 1)`,
      )
      .run(new Date(NOW.getTime() - 5_000).toISOString());

    const answer = await saleHistoryDetailFor(deps(), "sale-1");

    expect(answer.kind === "found" && answer.detail.voidability).toEqual({
      kind: "voidable",
      refunds: [
        {
          method: "CASH",
          card_type: null,
          amount: 3000,
          state: "APPROVED",
          sent_by_cloud: false,
        },
      ],
      credit_note_corrects: { point_of_sale: 3, number: 1204 },
    });
  });

  it("answers the refunds a sale of the open session would give when it may be voided", async () => {
    addSale({
      id: "unbilled",
      occurredAt: "2026-10-08T09:30:00.000Z",
      operationNumber: 483,
      deferred: true,
    });

    const answer = await saleHistoryDetailFor(deps(), "unbilled");

    expect(answer.kind === "found" && answer.detail.voidability).toEqual({
      kind: "voidable",
      refunds: [
        {
          method: "CASH",
          card_type: null,
          amount: 3000,
          state: "APPROVED",
          sent_by_cloud: false,
        },
      ],
      credit_note_corrects: null,
    });
  });

  it.each(["DEBIT", "CREDIT"] as const)(
    "answers the card type of a Point payment, and of the refund it would get, as %s",
    async (pointCardType) => {
      addSale({
        id: "by-card",
        occurredAt: "2026-10-08T09:30:00.000Z",
        operationNumber: 483,
        deferred: true,
        pointCardType,
      });

      const answer = await saleHistoryDetailFor(deps(), "by-card");

      expect(answer.kind === "found" && answer.detail.payments).toEqual([
        { method: "POINT", card_type: pointCardType, amount: 3000 },
      ]);
      expect(answer.kind === "found" && answer.detail.voidability).toMatchObject({
        kind: "voidable",
        refunds: [{ method: "POINT", card_type: pointCardType, amount: 3000 }],
      });
    },
  );

  it("answers that voiding needs no other person's authorization to a person who may void", async () => {
    addPerson("supervisor", "Grace", ["view_sales_history", "void_sale"]);
    signedInPerson.set("supervisor");

    const answer = await saleHistoryDetailFor(deps(), "sale-1");

    expect(answer.kind === "found" && answer.detail.void_authorization_required).toBe(false);
  });

  it("answers that a sale of a closed session cannot be voided", async () => {
    database.exec(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
       VALUES ('s0', 'r1', 'device-1', 'clerk', '2026-10-07T08:00:00.000Z', 0, 'CLOSED', '2026-10-07T20:00:00.000Z');`,
    );
    addSale({
      id: "old",
      occurredAt: "2026-10-07T09:00:00.000Z",
      operationNumber: 1,
      session: "s0",
    });

    const answer = await saleHistoryDetailFor(deps(), "old");

    expect(answer.kind === "found" && answer.detail.voidability).toEqual({
      kind: "not_voidable",
      refusal: "session_closed",
    });
  });

  it("answers a voided sale as voided, no longer voidable", async () => {
    addSale({
      id: "gone",
      occurredAt: "2026-10-08T10:00:00.000Z",
      operationNumber: 2,
      state: "VOIDED",
    });

    const answer = await saleHistoryDetailFor(deps(), "gone");

    expect(answer.kind === "found" && answer.detail).toMatchObject({
      state: "voided",
      voidability: { kind: "not_voidable", refusal: "not_completed" },
      reprint: { kind: "sale_voided" },
    });
  });

  it("answers the numbered duplicate as the next printing once the receipt was printed", async () => {
    database.exec(
      "UPDATE sales SET print_attempted_at = '2026-10-08T09:01:00.000Z', printed_at = '2026-10-08T09:01:03.000Z' WHERE id = 'sale-1'",
    );

    const answer = await saleHistoryDetailFor(deps(), "sale-1");

    expect(answer.kind === "found" && answer.detail.next_copy).toEqual({
      kind: "duplicate",
      order_number: 1,
    });
  });

  describe("the credit note of a voided sale", () => {
    function addCreditNote(answer: Record<string, string | number | null>): void {
      addSale({
        id: "gone",
        occurredAt: "2026-10-08T10:00:00.000Z",
        operationNumber: 2,
        state: "VOIDED",
      });
      database
        .prepare(
          `INSERT INTO sale_credit_notes (
             id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
             corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
             issued_at, authorization_code, authorization_code_due_on, recorded_at, answered_at
           ) VALUES (
             'note-1', 'gone', 3000, 5, 11, 3, 41, @state, @point_of_sale, @number, @issued_on,
             @issued_at, @authorization_code, @authorization_code_due_on,
             '2026-10-08T10:00:00.000Z', @answered_at
           )`,
        )
        .run({
          state: "IN_PROGRESS",
          point_of_sale: null,
          number: null,
          issued_on: null,
          issued_at: null,
          authorization_code: null,
          authorization_code_due_on: null,
          answered_at: null,
          ...answer,
        });
    }

    it("answers it in progress", async () => {
      addCreditNote({});

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.standing).toEqual({
        kind: "in_progress",
      });
    });

    it("answers its authorization as the credit note's own point of sale, number, date and code", async () => {
      addCreditNote({
        state: "AUTHORIZED",
        point_of_sale: 3,
        number: 7,
        issued_on: "2026-10-08",
        issued_at: "2026-10-08T10:00:03.000Z",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-18",
        answered_at: "2026-10-08T10:00:05.000Z",
      });

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.standing).toEqual({
        kind: "authorized",
        point_of_sale: 3,
        number: 7,
        issued_on: "2026-10-08",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-18",
      });
    });

    it("answers that the invoice already had a credit note", async () => {
      addCreditNote({ state: "ALREADY_CREDITED", answered_at: "2026-10-08T10:00:05.000Z" });

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.standing).toEqual({
        kind: "already_credited",
      });
    });

    it("answers its rejection", async () => {
      addCreditNote({ state: "REJECTED", answered_at: "2026-10-08T10:00:05.000Z" });

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.standing).toEqual({
        kind: "rejected",
      });
    });

    const AUTHORIZED = {
      state: "AUTHORIZED",
      point_of_sale: 3,
      number: 7,
      issued_on: "2026-10-08",
      issued_at: "2026-10-08T10:00:03.000Z",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-18",
      answered_at: "2026-10-08T10:00:05.000Z",
    };

    it("names the credit note the sale holds as the void's", async () => {
      addCreditNote({});

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes).toMatchObject([
        { credit_note_id: "note-1", origin: "sale_void" },
      ]);
    });

    it("answers a credit note to regularize as such", async () => {
      addCreditNote({ state: "REGULARIZATION_REQUIRED", answered_at: "2026-10-08T10:00:05.000Z" });

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.standing).toEqual({
        kind: "regularization_required",
      });
    });

    it("answers its original as the next printing of an authorized credit note never printed", async () => {
      addCreditNote(AUTHORIZED);

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.next_copy).toEqual({
        kind: "original",
      });
    });

    it("answers the numbered duplicate as its next printing once it was attempted, apart from the receipt's", async () => {
      addCreditNote(AUTHORIZED);
      database.exec(
        `INSERT INTO credit_note_prints (credit_note_id, print_attempted_at) VALUES ('note-1', '2026-10-08T10:01:00.000Z');
         INSERT INTO sale_reprints (sale_id, document, credit_note_id, order_number, requested_by, reason_kind, occurred_at)
         VALUES ('gone', 'credit_note', 'note-1', 1, 'clerk', 'retry', '2026-10-08T10:02:00.000Z')`,
      );

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail).toMatchObject({
        credit_notes: [{ next_copy: { kind: "duplicate", order_number: 2 } }],
        next_copy: { kind: "original" },
      });
    });

    it("answers no next printing while the credit note is not authorized", async () => {
      addCreditNote({});

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes[0]?.next_copy).toBeNull();
    });
  });

  describe("the credit notes of a sale with returns", () => {
    const AUTHORIZED_ANSWER = {
      state: "AUTHORIZED",
      issued_on: "2026-10-09",
      authorization_code: "75123456789012",
      authorization_code_due_on: "2026-10-19",
      answered_at: "2026-10-09T10:00:05.000Z",
    };

    function addSaleWithReturns(): void {
      addSale({
        id: "gone",
        occurredAt: "2026-10-08T10:00:00.000Z",
        operationNumber: 2,
        state: "COMPLETED",
      });
    }

    function addReturnCreditNote(
      noteId: string,
      returnId: string,
      recordedAt: string,
      answer: Record<string, string | number | null>,
    ): void {
      database
        .prepare(
          `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
           VALUES (@return_id, 'gone', 'r1', 'device-1', 's1', 'clerk', 'QR', @recorded_at)`,
        )
        .run({ return_id: returnId, recorded_at: recordedAt });
      database
        .prepare(
          `INSERT INTO sale_credit_notes (
             id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
             corrected_voucher_type, corrected_point_of_sale, corrected_number, state,
             point_of_sale, number, issued_on, issued_at, authorization_code,
             authorization_code_due_on, recorded_at, answered_at
           ) VALUES (
             @id, 'gone', @return_id, '2026-10-09', 1000, 5, 11, 3, 41, @state, @point_of_sale,
             @number, @issued_on, @issued_at, @authorization_code, @authorization_code_due_on,
             @recorded_at, @answered_at
           )`,
        )
        .run({
          id: noteId,
          return_id: returnId,
          recorded_at: recordedAt,
          state: "IN_PROGRESS",
          point_of_sale: null,
          number: null,
          issued_on: null,
          issued_at: null,
          authorization_code: null,
          authorization_code_due_on: null,
          answered_at: null,
          ...answer,
        });
    }

    it("lists the credit notes of two returns, each with its standing and number, in the order they were issued", async () => {
      addSaleWithReturns();
      addReturnCreditNote("note-second", "return-2", "2026-10-09T11:00:00.000Z", {
        ...AUTHORIZED_ANSWER,
        point_of_sale: 3,
        number: 9,
        issued_at: "2026-10-09T11:00:03.000Z",
      });
      addReturnCreditNote("note-first", "return-1", "2026-10-09T10:00:00.000Z", {
        ...AUTHORIZED_ANSWER,
        point_of_sale: 3,
        number: 8,
        issued_at: "2026-10-09T10:00:03.000Z",
      });

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(answer.kind === "found" && answer.detail.credit_notes).toEqual([
        {
          credit_note_id: "note-first",
          origin: "sale_return",
          standing: {
            kind: "authorized",
            point_of_sale: 3,
            number: 8,
            issued_on: "2026-10-09",
            authorization_code: "75123456789012",
            authorization_code_due_on: "2026-10-19",
          },
          next_copy: { kind: "original" },
        },
        {
          credit_note_id: "note-second",
          origin: "sale_return",
          standing: {
            kind: "authorized",
            point_of_sale: 3,
            number: 9,
            issued_on: "2026-10-09",
            authorization_code: "75123456789012",
            authorization_code_due_on: "2026-10-19",
          },
          next_copy: { kind: "original" },
        },
      ]);
    });

    it("counts the next printing of each credit note by its own reprints", async () => {
      addSaleWithReturns();
      addReturnCreditNote("note-first", "return-1", "2026-10-09T10:00:00.000Z", {
        ...AUTHORIZED_ANSWER,
        point_of_sale: 3,
        number: 8,
        issued_at: "2026-10-09T10:00:03.000Z",
      });
      addReturnCreditNote("note-second", "return-2", "2026-10-09T11:00:00.000Z", {
        ...AUTHORIZED_ANSWER,
        point_of_sale: 3,
        number: 9,
        issued_at: "2026-10-09T11:00:03.000Z",
      });
      database.exec(
        `INSERT INTO credit_note_prints (credit_note_id, print_attempted_at) VALUES ('note-first', '2026-10-09T10:01:00.000Z');
         INSERT INTO sale_reprints (sale_id, document, credit_note_id, order_number, requested_by, reason_kind, occurred_at)
         VALUES ('gone', 'credit_note', 'note-first', 1, 'clerk', 'retry', '2026-10-09T10:02:00.000Z')`,
      );

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(
        answer.kind === "found" && answer.detail.credit_notes.map((note) => note.next_copy),
      ).toEqual([{ kind: "duplicate", order_number: 2 }, { kind: "original" }]);
    });

    it("lists the credit notes of a return and of the void in the order they were recorded, each with its origin", async () => {
      addSaleWithReturns();
      database
        .prepare(
          `INSERT INTO sale_credit_notes (
             id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
             corrected_point_of_sale, corrected_number, state, recorded_at
           ) VALUES ('note-void', 'gone', 2000, 5, 11, 3, 41, 'IN_PROGRESS', '2026-10-08T12:00:00.000Z')`,
        )
        .run();
      addReturnCreditNote("note-return", "return-1", "2026-10-08T11:00:00.000Z", {
        state: "REGULARIZATION_REQUIRED",
        answered_at: "2026-10-08T11:00:05.000Z",
      });

      const answer = await saleHistoryDetailFor(deps(), "gone");

      expect(
        answer.kind === "found" &&
          answer.detail.credit_notes.map(({ credit_note_id, origin, standing }) => [
            credit_note_id,
            origin,
            standing.kind,
          ]),
      ).toEqual([
        ["note-return", "sale_return", "regularization_required"],
        ["note-void", "sale_void", "in_progress"],
      ]);
    });
  });

  describe("the invoice of a deferred sale", () => {
    function addDeferredSale({ satisfied }: { satisfied: boolean }): void {
      addSale({
        id: "late",
        occurredAt: "2026-10-08T09:30:00.000Z",
        operationNumber: 483,
        deferred: true,
        ...(satisfied ? { authorizedDocumentNumber: 1205 } : {}),
      });
      if (satisfied) {
        database.exec(
          "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-late', satisfied_at = '2026-10-08T10:00:00.000Z' WHERE sale_id = 'late'",
        );
      }
    }

    it("answers the short code recorded for the deferred sale", async () => {
      addDeferredSale({ satisfied: false });
      database.exec("UPDATE deferred_sales SET short_code = '7KQ4M2P9' WHERE sale_id = 'late'");

      const answer = await saleHistoryDetailFor(deps(), "late");

      expect(answer.kind === "found" && answer.detail.short_code).toBe("7KQ4M2P9");
    });

    it("answers no next printing while the sale is still waiting for its invoice", async () => {
      addDeferredSale({ satisfied: false });

      const answer = await saleHistoryDetailFor(deps(), "late");

      expect(answer.kind === "found" && answer.detail).toMatchObject({
        comprobante: { kind: "deferred_non_fiscal" },
        deferred_invoice_next_copy: null,
      });
    });

    it("answers its factura and its original as the next printing once invoiced and never printed", async () => {
      addDeferredSale({ satisfied: true });

      const answer = await saleHistoryDetailFor(deps(), "late");

      expect(answer.kind === "found" && answer.detail).toMatchObject({
        comprobante: { kind: "fiscal", point_of_sale: 3, number: 1205 },
        state: "completed",
        deferred_invoice_next_copy: { kind: "original" },
      });
    });

    it("answers the numbered duplicate as its next printing once its original was attempted, apart from the receipt's", async () => {
      addDeferredSale({ satisfied: true });
      database.exec(
        `INSERT INTO deferred_invoice_prints (sale_id, print_attempted_at, printed_at)
         VALUES ('late', '2026-10-08T10:01:00.000Z', '2026-10-08T10:01:03.000Z');
         INSERT INTO sale_reprints (sale_id, document, order_number, requested_by, reason_kind, occurred_at)
         VALUES ('late', 'deferred_invoice', 1, 'clerk', 'retry', '2026-10-08T10:02:00.000Z')`,
      );

      const answer = await saleHistoryDetailFor(deps(), "late");

      expect(answer.kind === "found" && answer.detail).toMatchObject({
        deferred_invoice_next_copy: { kind: "duplicate", order_number: 2 },
        next_copy: { kind: "original" },
      });
    });
  });
});
