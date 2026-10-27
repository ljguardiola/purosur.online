import { encodePinHash } from "@purosur/contracts";
import type { TicketReference } from "@purosur/domain";
import type { CloudCreditNoteAnswer, CloudCreditNoteCall } from "@purosur/domain/fiscal/use-cases";
import type { BranchSaleLookupAnswer } from "@purosur/domain/returns/use-cases";
import type { DeferredSaleInvoicingOutcome } from "@purosur/domain/sales/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import {
  insertDeferredSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertOfflineAuthorizationCode,
  insertOfflineCreditNoteSeriesCount,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  insertPointOfSale,
  OFFLINE_POINT_OF_SALE,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import {
  completeReturnFor,
  type FindSaleForReturnDeps,
  findSaleForReturnFor,
  previewReturnFor,
  type ReturnRequestDeps,
} from "./returns-requests";
import { readRetainedBranchSale } from "./sqlite-retained-branch-sales";
import { openSecondSession, openSoldSaleDatabase } from "./test-support/sold-sale-database";

const NOW = new Date("2026-09-20T15:00:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const SUPERVISOR_PIN = "1234";

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let idCount: number;
let askedTickets: TicketReference[];
let cloudAnswer: BranchSaleLookupAnswer;

function deps(overrides: Partial<FindSaleForReturnDeps> = {}): FindSaleForReturnDeps {
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
    branchSales: {
      async saleForReturn(ticket) {
        askedTickets.push(ticket);
        return cloudAnswer;
      },
    },
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
  askedTickets = [];
  cloudAnswer = { kind: "not_found" };
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

const BRANCH_SALE_TICKET = { kind: "invoice", pointOfSale: 7, number: 501 } as const;

const BRANCH_SALE: Extract<BranchSaleLookupAnswer, { kind: "found" }> = {
  kind: "found",
  sale: {
    sale: {
      id: "sale-elsewhere",
      registerId: "register-2",
      deviceId: "device-b",
      sessionId: "session-b",
      actorId: "cashier-b",
      state: "COMPLETED",
      saleDiscount: null,
      lines: [
        {
          id: "line-elsewhere",
          productId: "yerba",
          productName: "Yerba 1 kg",
          saleUnit: "UNIT",
          quantity: 3,
          promotionId: null,
          lineTotal: 7500,
        },
      ],
    },
    occurredAt: new Date("2026-09-12T18:30:00.000Z"),
    invoice: { pointOfSale: 7, number: 501 },
    payments: [
      {
        id: "pay-elsewhere",
        method: "CASH",
        provider: "NONE",
        amount: 7500,
        state: "APPROVED",
        refundedAmount: 0,
      },
    ],
    returned: [],
  },
  invoiceStanding: {
    fiscalDocuments: [
      {
        origin: "real_time",
        state: "AUTHORIZED",
        pointOfSale: 7,
        number: 501,
        buyerTaxStatusCode: 5,
      },
    ],
    deferralPending: false,
  },
  goodConditionReturnDays: 15,
  countedReturnIds: [],
};

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

  it("finds a sale of another register through the cloud and keeps a copy of it", async () => {
    cloudAnswer = BRANCH_SALE;

    expect(await findSaleForReturnFor(deps(), { ticket: BRANCH_SALE_TICKET })).toMatchObject({
      kind: "found",
      sale: {
        sale_id: "sale-elsewhere",
        invoice: { point_of_sale: 7, number: 501 },
        lines: [{ id: "line-elsewhere", returnable_quantity: 3 }],
      },
    });
    expect(askedTickets).toEqual([BRANCH_SALE_TICKET]);
    expect(readRetainedBranchSale(database, "sale-elsewhere")).toEqual({
      sale: BRANCH_SALE.sale,
      invoiceStanding: BRANCH_SALE.invoiceStanding,
      ticket: BRANCH_SALE_TICKET,
      goodConditionReturnDays: 15,
      countedReturnIds: [],
    });
  });

  it("counts what this register already returned of a sale of another register", async () => {
    cloudAnswer = BRANCH_SALE;
    database.exec(
      `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
       VALUES ('return-here', 'sale-elsewhere', 'register-1', 'device-a', 'session-1', 'u1', 'TYPED', '2026-09-20T12:00:00.000Z');
       INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
       VALUES ('return-here', 'line-elsewhere', 1, 'defective', 'discard', 2500);`,
    );

    expect(await findSaleForReturnFor(deps(), { ticket: BRANCH_SALE_TICKET })).toMatchObject({
      kind: "found",
      sale: { lines: [{ id: "line-elsewhere", returned_quantity: 1, returnable_quantity: 2 }] },
    });
  });

  it("answers that a connection is needed when the cloud cannot be reached", async () => {
    cloudAnswer = { kind: "unreachable" };

    expect(await findSaleForReturnFor(deps(), { ticket: BRANCH_SALE_TICKET })).toEqual({
      kind: "needs_connection",
    });
    expect(readRetainedBranchSale(database, "sale-elsewhere")).toBeUndefined();
  });

  it("never asks the cloud on behalf of a cashier without the permission", async () => {
    addPerson("u4", "Ada", ["sell_and_charge"]);
    signedInPerson.set("u4");
    cloudAnswer = BRANCH_SALE;

    expect(await findSaleForReturnFor(deps(), { ticket: BRANCH_SALE_TICKET })).toEqual({
      kind: "lacks_permission",
    });
    expect(askedTickets).toEqual([]);
  });

  it("does not ask the cloud for a sale this register holds", async () => {
    await findSaleForReturnFor(deps(), { ticket: BY_SALE });

    expect(askedTickets).toEqual([]);
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

describe("the credit note of a completed return", () => {
  const AUTHORIZED: CloudCreditNoteAnswer = {
    kind: "authorized",
    pointOfSale: 12,
    number: 7,
    issuedOn: "2026-09-20",
    issuedAt: NOW,
    authorizationCode: "75123456789012",
    authorizationCodeDueOn: "2026-09-30",
  };

  interface Rig {
    steps: string[];
    calls: CloudCreditNoteCall[];
    printed: { saleId: string; creditNoteId: string }[];
    failures: unknown[];
    deps: Partial<ReturnRequestDeps>;
  }

  function rig(
    reply: CloudCreditNoteAnswer | null,
    catchUp: () => Promise<DeferredSaleInvoicingOutcome> = async () => ({ kind: "not_pending" }),
  ): Rig {
    const state: Rig = { steps: [], calls: [], printed: [], failures: [], deps: {} };
    state.deps = {
      creditNotes: {
        request: async (call) => {
          state.steps.push("cloud");
          state.calls.push(call);
          return reply;
        },
      },
      invoicing: {
        invoiceUpTo: async (saleId) => {
          state.steps.push(`catch-up:${saleId}`);
          return catchUp();
        },
      },
      printCreditNote: async (creditNote) => {
        state.printed.push(creditNote);
      },
      reportFailure: (error) => {
        state.failures.push(error);
      },
    };
    return state;
  }

  beforeEach(() => {
    insertPointOfSale(database, 0);
  });

  function invoiceTheSale() {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertHealthCheck(database, { checkedAt: "2026-09-20T14:59:58.000Z" });
  }

  function storedNotes() {
    return database
      .prepare("SELECT return_id, state, corrected_number FROM sale_credit_notes")
      .all();
  }

  it("is requested from the cloud once the return completes, and printed when authorized", async () => {
    invoiceTheSale();
    const { deps: extra, calls, printed, steps } = rig(AUTHORIZED);

    const outcome = await completeReturnFor(deps(extra), completion());

    expect(outcome).toMatchObject({ kind: "completed", refunded_total: 5000 });
    expect(steps).toEqual(["cloud"]);
    expect(calls).toMatchObject([
      {
        pointOfSale: 12,
        saleEvent: { event_type: "sale_returned", schema_version: 2 },
        invoice: { voucher: { number: 41 }, buyerTaxStatusCode: expect.any(Number) },
      },
    ]);
    expect(storedNotes()).toEqual([
      { return_id: "id-1", state: "AUTHORIZED", corrected_number: 41 },
    ]);
    expect(printed).toEqual([{ saleId: "sale-1", creditNoteId: calls[0]?.creditNoteId }]);
  });

  it("stays in progress, nothing printed, while the cloud gives no answer", async () => {
    invoiceTheSale();
    const { deps: extra, printed } = rig(null);

    await expect(completeReturnFor(deps(extra), completion())).resolves.toMatchObject({
      kind: "completed",
    });

    expect(storedNotes()).toEqual([
      { return_id: "id-1", state: "IN_PROGRESS", corrected_number: 41 },
    ]);
    expect(printed).toEqual([]);
  });

  it("invoices the deferred sale first, then requests the credit note of the invoice it issued", async () => {
    insertDeferredSale(database, "sale-1");
    const {
      deps: extra,
      steps,
      calls,
    } = rig(AUTHORIZED, async () => {
      steps.push("invoiced");
      insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
      database.exec(
        `UPDATE deferred_sales SET satisfied_by_fiscal_document_id = 'doc-1',
           satisfied_at = '2026-09-20T15:00:01.000Z'`,
      );
      return { kind: "invoiced" };
    });

    await completeReturnFor(deps(extra), completion());

    expect(steps).toEqual(["catch-up:sale-1", "invoiced", "cloud"]);
    expect(calls[0]?.invoice?.voucher.number).toBe(41);
    expect(storedNotes()).toEqual([
      { return_id: "id-1", state: "AUTHORIZED", corrected_number: 41 },
    ]);
  });

  it("completes the return and reports the failure when invoicing the deferred sale breaks", async () => {
    insertDeferredSale(database, "sale-1");
    const { deps: extra, failures } = rig(AUTHORIZED, async () => {
      throw new Error("catch-up broke");
    });

    await expect(completeReturnFor(deps(extra), completion())).resolves.toMatchObject({
      kind: "completed",
    });

    expect(failures).toEqual([new Error("catch-up broke")]);
    expect(count("returns")).toBe(1);
  });

  it("asks for nothing, neither invoicing nor the cloud, when no credit note was asked for", async () => {
    const { deps: extra, steps, printed } = rig(AUTHORIZED);

    await completeReturnFor(deps(extra), completion());

    expect(steps).toEqual([]);
    expect(printed).toEqual([]);
  });

  it("completes the return without asking anyone when the register is wired to no cloud", async () => {
    invoiceTheSale();

    await expect(completeReturnFor(deps(), completion())).resolves.toMatchObject({
      kind: "completed",
    });

    expect(storedNotes()).toEqual([
      { return_id: "id-1", state: "IN_PROGRESS", corrected_number: 41 },
    ]);
  });
});

describe("returning a sale another register rang up", () => {
  const LINE_BACK = {
    saleLineId: "line-elsewhere",
    quantity: 1,
    reason: "change_of_mind",
    disposition: "restock",
  } as const;

  const COMPLETION = {
    saleId: "sale-elsewhere",
    ticketSource: "TYPED" as const,
    lines: [LINE_BACK],
    refunds: [{ paymentId: "pay-elsewhere", amount: 2500 }],
  };

  const AUTHORIZED: CloudCreditNoteAnswer = {
    kind: "authorized",
    pointOfSale: 12,
    number: 7,
    issuedOn: "2026-09-20",
    issuedAt: NOW,
    authorizationCode: "75123456789012",
    authorizationCodeDueOn: "2026-09-30",
  };

  async function findWithConnection(answer: BranchSaleLookupAnswer = BRANCH_SALE) {
    cloudAnswer = answer;
    await findSaleForReturnFor(deps(), { ticket: BRANCH_SALE_TICKET });
    cloudAnswer = { kind: "unreachable" };
    askedTickets = [];
  }

  function storedNotes() {
    return database
      .prepare(
        "SELECT sale_id, return_id, state, corrected_point_of_sale, corrected_number FROM sale_credit_notes",
      )
      .all();
  }

  it("previews it without asking the cloud once the sale was found", async () => {
    await findWithConnection();

    expect(
      await previewReturnFor(deps(), { saleId: "sale-elsewhere", lines: [LINE_BACK] }),
    ).toEqual({
      kind: "previewed",
      lines: [
        {
          sale_line_id: "line-elsewhere",
          quantity: 1,
          reason: "change_of_mind",
          disposition: "restock",
          refusal: null,
          refund_amount: 2500,
        },
      ],
      refundable_total: 2500,
    });
    expect(askedTickets).toEqual([]);
  });

  it("completes it without a connection, refunding in cash from the open session and queueing the return", async () => {
    await findWithConnection();

    const outcome = await completeReturnFor(deps(), COMPLETION);

    expect(outcome).toEqual({
      kind: "completed",
      return_id: "id-1",
      refunded_total: 2500,
      refunds: [{ payment_id: "pay-elsewhere", method: "CASH", amount: 2500, state: "APPROVED" }],
      authorized_by: null,
    });
    expect(askedTickets).toEqual([]);
    expect(
      database.prepare("SELECT sale_id, session_id, register_id, device_id FROM returns").all(),
    ).toEqual([
      {
        sale_id: "sale-elsewhere",
        session_id: "session-2",
        register_id: "register-1",
        device_id: "device-a",
      },
    ]);
    expect(
      database.prepare("SELECT payment_id, return_id, amount FROM payment_refunds").all(),
    ).toEqual([{ payment_id: "pay-elsewhere", return_id: "id-1", amount: 2500 }]);
    expect(
      database
        .prepare("SELECT session_id, type, amount FROM cash_movements WHERE type = 'REFUND'")
        .all(),
    ).toEqual([{ session_id: "session-2", type: "REFUND", amount: 2500 }]);
    expect(
      database
        .prepare<[], { payload: string }>(
          "SELECT payload FROM outbox WHERE event_type = 'sale_returned'",
        )
        .all()
        .map(({ payload }) => JSON.parse(payload)),
    ).toMatchObject([
      { sale_id: "sale-elsewhere", register_id: "register-1", device_id: "device-a" },
    ]);
  });

  it("counts the return against the copy of the sale, so the same line cannot be returned past what was sold", async () => {
    await findWithConnection();
    await completeReturnFor(deps(), {
      ...COMPLETION,
      lines: [{ ...LINE_BACK, quantity: 3 }],
      refunds: [{ paymentId: "pay-elsewhere", amount: 7500 }],
    });

    expect(
      await previewReturnFor(deps(), { saleId: "sale-elsewhere", lines: [LINE_BACK] }),
    ).toMatchObject({ lines: [{ refusal: expect.anything() }] });
  });

  it("requests the credit note from the cloud for the invoice the other register issued", async () => {
    insertPointOfSale(database, 0);
    insertHealthCheck(database, { checkedAt: "2026-09-20T14:59:58.000Z" });
    await findWithConnection();
    const calls: CloudCreditNoteCall[] = [];

    const outcome = await completeReturnFor(
      deps({
        creditNotes: {
          request: async (call) => {
            calls.push(call);
            return AUTHORIZED;
          },
        },
      }),
      COMPLETION,
    );

    expect(outcome).toMatchObject({ kind: "completed", refunded_total: 2500 });
    expect(calls).toMatchObject([
      { invoice: { voucher: { pointOfSale: 7, number: 501 }, buyerTaxStatusCode: 5 } },
    ]);
    expect(storedNotes()).toEqual([
      {
        sale_id: "sale-elsewhere",
        return_id: "id-1",
        state: "AUTHORIZED",
        corrected_point_of_sale: 7,
        corrected_number: 501,
      },
    ]);
  });

  it("issues the credit note itself, correcting the other register's invoice, when the register is not online", async () => {
    insertPointOfSale(database, 0);
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE);
    insertOfflineCreditNoteSeriesCount(database, OFFLINE_POINT_OF_SALE, 0);
    insertOfflineNumberBlock(database, "block-1", 1, 50, OFFLINE_POINT_OF_SALE, "credit_note_c");
    insertOfflineAuthorizationCode(database);
    await findWithConnection();

    const outcome = await completeReturnFor(deps(), COMPLETION);

    expect(outcome).toMatchObject({ kind: "completed", refunded_total: 2500 });
    expect(storedNotes()).toEqual([
      {
        sale_id: "sale-elsewhere",
        return_id: "id-1",
        state: "ISSUED_OFFLINE",
        corrected_point_of_sale: 7,
        corrected_number: 501,
      },
    ]);
    expect(
      database
        .prepare("SELECT sale_id, document_type, corrected_number FROM offline_fiscal_documents")
        .all(),
    ).toEqual([
      { sale_id: "sale-elsewhere", document_type: "credit_note_c", corrected_number: 501 },
    ]);
  });

  it("holds the credit note for the invoice when it is still on its way on the other register", async () => {
    await findWithConnection({
      ...BRANCH_SALE,
      invoiceStanding: { fiscalDocuments: [], deferralPending: true },
    });

    await completeReturnFor(deps(), COMPLETION);

    expect(storedNotes()).toEqual([
      {
        sale_id: "sale-elsewhere",
        return_id: "id-1",
        state: "AWAITING_INVOICE",
        corrected_point_of_sale: null,
        corrected_number: null,
      },
    ]);
  });

  it("asks for no credit note when the sale was never invoiced", async () => {
    await findWithConnection({
      ...BRANCH_SALE,
      invoiceStanding: { fiscalDocuments: [], deferralPending: false },
    });

    await completeReturnFor(deps(), COMPLETION);

    expect(storedNotes()).toEqual([]);
  });
});
