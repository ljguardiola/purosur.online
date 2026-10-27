import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import type { LocalDatabase } from "../platform/local-database";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import {
  completeReturnFor,
  findSaleForReturnFor,
  previewReturnFor,
  type ReturnRequestDeps,
} from "./returns-requests";
import { openSecondSession, openSoldSaleDatabase } from "./test-support/sold-sale-database";

const NOW = new Date("2026-09-20T15:00:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const SUPERVISOR_PIN = "1234";

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let idCount: number;

function deps(overrides: Partial<ReturnRequestDeps> = {}): ReturnRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === SUPERVISOR_PIN ? PIN_HASH : "hash-of-another-pin"),
      now: () => NOW,
    }),
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
    zoneRules: fixedZoneRulesSource(),
    ...overrides,
  };
}

function addPerson(id: string, firstName: string, permissions: string[]): void {
  database
    .prepare(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-${id}', 'Rol', 0, 1)`,
    )
    .run();
  for (const key of permissions) {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-${id}', ?, 1)`,
      )
      .run(key);
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

const BY_SALE = { kind: "sale", saleId: "sale-1" } as const;

const YERBA = {
  saleLineId: "line-1",
  quantity: 2,
  reason: "change_of_mind",
  disposition: "restock",
} as const;

function completion(overrides: Partial<Parameters<typeof completeReturnFor>[1]> = {}) {
  return {
    saleId: "sale-1",
    ticketSource: "QR" as const,
    lines: [YERBA],
    refunds: [{ paymentId: "pay-cash", amount: 5000 }],
    ...overrides,
  };
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT count(*) AS total FROM ${table}`).get()
    ?.total as number;
}

beforeEach(() => {
  idCount = 0;
  database = openSoldSaleDatabase();
  openSecondSession(database);
  addPerson("u3", "Linus", ["sell_and_charge", "process_return"]);
  addPerson("u2", "Grace", ["process_return"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u3");
});

afterEach(() => {
  database.close();
});

describe("finding the sale to return", () => {
  it("writes when the sale happened on the clock of the zone rules it is given", async () => {
    const rules = {
      version: "2026a",
      transitions: [{ from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: 0 }],
    };

    const outcome = await findSaleForReturnFor(deps({ zoneRules: { zoneRules: () => rules } }), {
      ticket: BY_SALE,
    });

    expect(outcome).toMatchObject({
      kind: "found",
      sale: { occurred_at: "2026-09-12T18:30:00.000+00:00" },
    });
  });

  it("answers the sale, its returnable lines and its payments to a person who may process returns", async () => {
    const outcome = await findSaleForReturnFor(deps(), { ticket: BY_SALE });

    expect(outcome).toMatchObject({
      kind: "found",
      sale: {
        sale_id: "sale-1",
        occurred_at: "2026-09-12T15:30:00.000-03:00",
        total: 11_500,
        invoice: null,
        windows: {
          change_of_mind: { last_allowed_day: "2026-09-27", open: true },
          defective: { last_allowed_day: "2027-03-12", open: true },
        },
      },
    });
    if (outcome.kind !== "found") {
      throw new Error("test setup: the sale was not found");
    }
    expect(outcome.sale.lines).toEqual([
      {
        id: "line-1",
        product_id: "yerba",
        product_name: "Yerba 1 kg",
        sale_unit: "UNIT",
        sold_quantity: 3,
        returned_quantity: 0,
        returnable_quantity: 3,
        charged_amount: 7500,
        refunded_amount: 0,
        must_be_returned_whole: false,
      },
      {
        id: "line-2",
        product_id: "galletitas",
        product_name: "Galletitas",
        sale_unit: "UNIT",
        sold_quantity: 4,
        returned_quantity: 0,
        returnable_quantity: 4,
        charged_amount: 4000,
        refunded_amount: 0,
        must_be_returned_whole: true,
      },
    ]);
    expect(outcome.sale.payments).toEqual([
      {
        payment_id: "pay-cash",
        method: "CASH",
        amount: 6000,
        refunded_amount: 0,
        remaining: 6000,
        eligible: true,
        ineligible_reason: null,
      },
      {
        payment_id: "pay-transfer",
        method: "TRANSFER",
        amount: 5500,
        refunded_amount: 0,
        remaining: 5500,
        eligible: false,
        ineligible_reason: "not_cash",
      },
    ]);
  });

  it("finds the sale from the invoice of its ticket", async () => {
    database.exec(
      `INSERT INTO fiscal_documents (
         id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
       ) VALUES ('doc-1', 'sale-1', 12, 'factura_c', 41, '2026-09-12', '{"total":11500}', 'AUTHORIZED',
          '75123456789012', '2026-09-22', '2026-09-12T18:30:00.000Z', '2026-09-12T18:30:01.000Z')`,
    );

    expect(
      await findSaleForReturnFor(deps(), {
        ticket: { kind: "invoice", pointOfSale: 12, number: 41 },
      }),
    ).toMatchObject({
      kind: "found",
      sale: { sale_id: "sale-1", invoice: { point_of_sale: 12, number: 41 } },
    });
  });

  it("answers not found for a ticket this register does not know", async () => {
    expect(
      await findSaleForReturnFor(deps(), {
        ticket: { kind: "invoice", pointOfSale: 12, number: 99 },
      }),
    ).toEqual({ kind: "not_found" });
  });

  it("answers voided for a sale that was voided", async () => {
    database.exec("UPDATE sales SET state = 'VOIDED', voided_at = '2026-09-13T12:00:00.000Z'");

    expect(await findSaleForReturnFor(deps(), { ticket: BY_SALE })).toEqual({ kind: "voided" });
  });

  it("refuses a cashier without the permission who brings no authorization", async () => {
    signedInPerson.set("u4");
    addPerson("u4", "Ada", ["sell_and_charge"]);

    expect(await findSaleForReturnFor(deps(), { ticket: BY_SALE })).toEqual({
      kind: "lacks_permission",
    });
  });

  it("finds the sale for a cashier without the permission when a person who holds it authorizes with their PIN", async () => {
    addPerson("u4", "Ada", ["sell_and_charge"]);
    signedInPerson.set("u4");

    expect(
      await findSaleForReturnFor(deps(), {
        ticket: BY_SALE,
        authorization: { user_id: "u2", pin: SUPERVISOR_PIN },
      }),
    ).toMatchObject({ kind: "found" });
  });

  it("refuses a wrong PIN", async () => {
    addPerson("u4", "Ada", ["sell_and_charge"]);
    signedInPerson.set("u4");

    expect(
      await findSaleForReturnFor(deps(), {
        ticket: BY_SALE,
        authorization: { user_id: "u2", pin: "0000" },
      }),
    ).toMatchObject({ kind: "wrong_pin" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await findSaleForReturnFor(deps(), { ticket: BY_SALE })).toEqual({
      kind: "not_signed_in",
    });
  });
});

describe("previewing a return", () => {
  it("answers what each line would refund and the total", async () => {
    expect(await previewReturnFor(deps(), { saleId: "sale-1", lines: [YERBA] })).toEqual({
      kind: "previewed",
      lines: [
        {
          sale_line_id: "line-1",
          quantity: 2,
          reason: "change_of_mind",
          disposition: "restock",
          refusal: null,
          refund_amount: 5000,
        },
      ],
      refundable_total: 5000,
    });
  });

  it("names the refusal of a line with its last allowed day", async () => {
    expect(
      await previewReturnFor(deps({ now: () => new Date("2026-09-28T15:00:00.000Z") }), {
        saleId: "sale-1",
        lines: [YERBA],
      }),
    ).toMatchObject({
      kind: "previewed",
      lines: [
        {
          refusal: {
            kind: "outside_window",
            reason: "change_of_mind",
            last_allowed_day: "2026-09-27",
          },
          refund_amount: null,
        },
      ],
      refundable_total: 0,
    });
  });

  it("answers a line left without reason or disposition as refused, as the screen is still being filled", async () => {
    expect(
      await previewReturnFor(deps(), {
        saleId: "sale-1",
        lines: [{ ...YERBA, reason: null, disposition: null }],
      }),
    ).toMatchObject({ kind: "previewed", lines: [{ refusal: { kind: "missing_reason" } }] });
  });

  it("answers not found for a sale the register does not hold", async () => {
    expect(await previewReturnFor(deps(), { saleId: "missing", lines: [] })).toEqual({
      kind: "not_found",
    });
  });

  it("answers not returnable for a voided sale", async () => {
    database.exec("UPDATE sales SET state = 'VOIDED', voided_at = '2026-09-13T12:00:00.000Z'");

    expect(await previewReturnFor(deps(), { saleId: "sale-1", lines: [] })).toEqual({
      kind: "sale_not_returnable",
    });
  });

  it("previews it for a person who may process returns but not sell", async () => {
    signedInPerson.set("u2");

    expect(await previewReturnFor(deps(), { saleId: "sale-1", lines: [YERBA] })).toMatchObject({
      kind: "previewed",
      refundable_total: 5000,
    });
  });

  it("previews it for a person who holds no permission, as finding the sale already asked for one", async () => {
    addPerson("u5", "Ada", []);
    signedInPerson.set("u5");

    expect(await previewReturnFor(deps(), { saleId: "sale-1", lines: [YERBA] })).toMatchObject({
      kind: "previewed",
    });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await previewReturnFor(deps(), { saleId: "sale-1", lines: [] })).toEqual({
      kind: "not_signed_in",
    });
  });

  it("writes nothing", async () => {
    await previewReturnFor(deps(), { saleId: "sale-1", lines: [YERBA] });

    for (const table of [
      "returns",
      "return_lines",
      "payment_refunds",
      "cash_movements",
      "stock_movements",
      "outbox",
    ]) {
      expect(count(table)).toBe(0);
    }
  });
});

describe("completing a return", () => {
  it("completes it for a person who holds the permission, refunding in cash", async () => {
    const outcome = await completeReturnFor(deps(), completion());

    expect(outcome).toEqual({
      kind: "completed",
      return_id: "id-1",
      refunded_total: 5000,
      refunds: [{ payment_id: "pay-cash", method: "CASH", amount: 5000, state: "APPROVED" }],
      authorized_by: null,
    });
    expect(
      database
        .prepare("SELECT sale_id, session_id, actor_id, authorized_by, ticket_source FROM returns")
        .all(),
    ).toEqual([
      {
        sale_id: "sale-1",
        session_id: "session-2",
        actor_id: "u3",
        authorized_by: null,
        ticket_source: "QR",
      },
    ]);
  });

  it("names who authorized it, in the answer and in the return, with the PIN of a person who holds the permission", async () => {
    addPerson("u4", "Ada", ["sell_and_charge"]);
    signedInPerson.set("u4");

    const outcome = await completeReturnFor(
      deps(),
      completion({ authorization: { user_id: "u2", pin: SUPERVISOR_PIN } }),
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      authorized_by: { user_id: "u2", first_name: "Grace" },
    });
    expect(database.prepare("SELECT actor_id, authorized_by FROM returns").all()).toEqual([
      { actor_id: "u4", authorized_by: "u2" },
    ]);
    expect(database.prepare("SELECT actor_id, authorized_by FROM cash_movements").all()).toEqual([
      { actor_id: "u4", authorized_by: "u2" },
    ]);
  });

  it("refuses a cashier without the permission who brings no authorization, changing nothing", async () => {
    addPerson("u4", "Ada", ["sell_and_charge"]);
    signedInPerson.set("u4");

    expect(await completeReturnFor(deps(), completion())).toEqual({ kind: "lacks_permission" });
    expect(count("returns")).toBe(0);
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await completeReturnFor(deps(), completion())).toEqual({ kind: "not_signed_in" });
  });

  it("answers not found for a sale the register does not hold", async () => {
    expect(await completeReturnFor(deps(), completion({ saleId: "missing" }))).toEqual({
      kind: "not_found",
    });
  });

  it("answers not returnable for a voided sale", async () => {
    database.exec("UPDATE sales SET state = 'VOIDED', voided_at = '2026-09-13T12:00:00.000Z'");

    expect(await completeReturnFor(deps(), completion())).toEqual({ kind: "sale_not_returnable" });
  });

  it("answers that no session is open", async () => {
    database.exec(
      "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-09-20T20:00:00.000Z' WHERE state = 'OPEN'",
    );

    expect(await completeReturnFor(deps(), completion())).toEqual({ kind: "no_open_session" });
  });

  it("answers that no line was chosen", async () => {
    expect(await completeReturnFor(deps(), completion({ lines: [] }))).toEqual({
      kind: "no_lines",
    });
  });

  it("names the line it refuses, and why, in the wire's words", async () => {
    expect(
      await completeReturnFor(deps(), completion({ lines: [{ ...YERBA, disposition: null }] })),
    ).toEqual({
      kind: "line_refused",
      sale_line_id: "line-1",
      refusal: { kind: "missing_disposition" },
    });
    expect(
      await completeReturnFor(
        deps({ now: () => new Date("2026-09-28T15:00:00.000Z") }),
        completion(),
      ),
    ).toEqual({
      kind: "line_refused",
      sale_line_id: "line-1",
      refusal: { kind: "outside_window", reason: "change_of_mind", last_allowed_day: "2026-09-27" },
    });
  });

  it("names the refund it refuses, in the wire's words", async () => {
    expect(
      await completeReturnFor(
        deps(),
        completion({ refunds: [{ paymentId: "pay-cash", amount: 4000 }] }),
      ),
    ).toEqual({
      kind: "refund_refused",
      refusal: { kind: "total_mismatch", refundable_total: 5000, imputed: 4000 },
    });
    expect(
      await completeReturnFor(
        deps(),
        completion({ refunds: [{ paymentId: "pay-transfer", amount: 5000 }] }),
      ),
    ).toEqual({
      kind: "refund_refused",
      refusal: { kind: "not_cash", payment_id: "pay-transfer" },
    });
  });

  it("is unavailable while the register has no outbox chain key, changing nothing", async () => {
    expect(
      await completeReturnFor(deps({ readOutboxChainKey: async () => undefined }), completion()),
    ).toEqual({ kind: "unavailable" });
    expect(count("returns")).toBe(0);
  });
});
