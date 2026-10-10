import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
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
}

function addSale({
  id,
  occurredAt,
  operationNumber,
  deferred = false,
  authorizedDocumentNumber,
}: SaleSeed): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
       VALUES (?, 'r1', 'device-1', 's1', 'clerk', 'COMPLETED', ?, ?)`,
    )
    .run(id, occurredAt, operationNumber);
  database
    .prepare(
      `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
       VALUES (?, ?, 1, 'p1', 'Yerba', 2, 1500, 'list-1', 0, 3000)`,
    )
    .run(`line-${id}`, id);
  database
    .prepare(
      `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
       VALUES (?, ?, 'SALE', 'CASH', 'NONE', 3000, 3000, 'APPROVED', ?)`,
    )
    .run(`pay-${id}`, id, occurredAt);
  if (deferred) {
    database
      .prepare(
        "INSERT INTO deferred_sales (sale_id, reason, routed_at) VALUES (?, 'fiscally_offline', ?)",
      )
      .run(id, occurredAt);
  }
  if (authorizedDocumentNumber !== undefined) {
    database
      .prepare(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES (?, ?, 3, 'FACTURA_C', ?, '2026-10-08', '{}', 'AUTHORIZED', '75123456789012', '2026-10-18', ?, ?)`,
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
          occurred_at: "2026-10-08T15:00:00.000Z",
          comprobante: {
            kind: "fiscal",
            document_type: "factura_c",
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
          occurred_at: "2026-10-08T09:00:00.000Z",
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
        occurred_at: "2026-10-08T09:00:00.000Z",
        total: 3000,
        comprobante: { kind: "fiscal", document_type: "factura_c", point_of_sale: 3, number: 1204 },
        operation_number: 482,
        served_by_first_name: "Linus",
        line_count: 1,
        payments: [{ method: "CASH", amount: 3000 }],
        state: "completed",
        next_copy: { kind: "original" },
      },
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
});
