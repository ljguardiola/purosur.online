import { encodePinHash } from "@purosur/contracts";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import {
  A_DEFERRED_SALE_RECORDED_FACT,
  aCancelledSaleFact,
  aCompletedSaleFact,
  aVoidedSaleFact,
} from "@purosur/domain/sync/test-support";
import type { RegisterReplenishmentTransaction, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { ReplenishedUser } from "@purosur/domain/users/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { signIn } from "../sessions/sign-in";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteRegisterReplenishmentStore } from "./sqlite-register-replenishment-store";

const PEPPER = Buffer.alloc(32, 9).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const SOURCE = { eventId: "event-1", deviceId: "device-old" };

let database: LocalDatabase;
let generated = 0;
let store: SqliteRegisterReplenishmentStore;

function aUser(overrides: Partial<ReplenishedUser> = {}): ReplenishedUser {
  return {
    userId: "user-1",
    firstName: "Ana",
    roleId: "role-1",
    salt: SALT,
    pinHash: PIN_HASH,
    active: true,
    version: 1,
    ...overrides,
  };
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT COUNT(*) AS total FROM ${table}`).get()
    ?.total as number;
}

async function signInWith(pin: string, userId = "user-1") {
  return signIn(
    {
      store: new SqliteSignInStore(database),
      signedInPerson: createSignedInPerson(),
      readPepper: async () => PEPPER,
      hashPin: async (candidate) => (candidate === "1234" ? PIN_HASH : "hash-of-another-pin"),
      now: () => new Date("2026-10-08T10:00:00.000Z"),
      openCashSession: () => undefined,
      cashSession: () => null,
    },
    userId,
    pin,
  );
}

beforeEach(() => {
  generated = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-1', 'Cajera', 0, 1);
     INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-1', 'sell_and_charge', 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-new', 'device-old', 'cashier-1', '2026-10-07T08:00:00.000Z', 5000, 'OPEN');`,
  );
  store = new SqliteRegisterReplenishmentStore({
    database,
    pepper: PEPPER,
    ids: { next: () => `generated-${++generated}` },
  });
});

afterEach(() => {
  database.close();
});

describe("the register's store for replenishing a restored register", () => {
  describe("the predecessor", () => {
    it("is unknown when the register was not restored", async () => {
      expect(await store.predecessor()).toBeUndefined();
    });

    it("is the installation the restored snapshot came from, with the last sequence the cloud acknowledged", async () => {
      database
        .prepare(
          "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)",
        )
        .run("device-old", 52);

      expect(await store.predecessor()).toEqual({
        deviceId: "device-old",
        lastAcknowledgedSeq: 52,
      });
    });

    it("is forgotten once finished", async () => {
      database
        .prepare(
          "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)",
        )
        .run("device-old", 52);

      await store.finish();

      expect(await store.predecessor()).toBeUndefined();
    });
  });

  describe("the users", () => {
    it("lets a cashier of the cloud's list sign in with their PIN, derived with this installation's pepper", async () => {
      await store.applyUsers([aUser()]);

      expect(await signInWith("1234")).toMatchObject({ kind: "signed_in" });
      expect(
        database.prepare("SELECT verifier FROM pin_verifiers WHERE user_id = 'user-1'").get(),
      ).toEqual({ verifier: derivePinVerifier(PEPPER, PIN_HASH) });
    });

    it("refuses a wrong PIN", async () => {
      await store.applyUsers([aUser()]);

      expect(await signInWith("9999")).toMatchObject({ kind: "wrong_pin" });
    });

    it("derives the verifier of a user the snapshot already holds at the same version, whose verifier it lost", async () => {
      await store.applyUsers([aUser()]);
      database.exec("DELETE FROM pin_verifiers");

      await store.applyUsers([aUser()]);

      expect(await signInWith("1234")).toMatchObject({ kind: "signed_in" });
    });

    it("never overwrites a user with an older version of themselves", async () => {
      await store.applyUsers([aUser({ version: 5, firstName: "Ana B" })]);

      await store.applyUsers([aUser({ version: 2, firstName: "Ana A" })]);

      expect(database.prepare("SELECT first_name, version FROM users").get()).toEqual({
        first_name: "Ana B",
        version: 5,
      });
    });

    it("holds no verifier for a user who has no PIN", async () => {
      await store.applyUsers([aUser({ userId: "user-2", pinHash: null, salt: null })]);

      expect(count("users")).toBe(1);
      expect(count("pin_verifiers")).toBe(0);
    });

    it("keeps an inactive user from signing in", async () => {
      await store.applyUsers([aUser({ active: false })]);

      expect(await signInWith("1234")).not.toMatchObject({ kind: "signed_in" });
    });

    it("writes none of the users when one of them cannot be written", async () => {
      database.exec(
        `CREATE TRIGGER refuse_user_2 BEFORE INSERT ON users WHEN NEW.id = 'user-2'
         BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END;`,
      );

      await expect(store.applyUsers([aUser(), aUser({ userId: "user-2" })])).rejects.toThrow(
        "storage unavailable",
      );

      expect(count("users") + count("pin_verifiers")).toBe(0);
    });
  });

  describe("the events", () => {
    it("knows an event is applied once it was recorded as applied", async () => {
      expect(await store.transaction((tx) => tx.eventApplied("event-1"))).toBe(false);

      await store.transaction((tx) => tx.recordEventApplied("event-1"));

      expect(await store.transaction((tx) => tx.eventApplied("event-1"))).toBe(true);
    });

    it("applies a cash fact with the cash session writers", async () => {
      const fact: SyncedFact = {
        kind: "cash_movement_recorded",
        movement: {
          sessionId: "session-1",
          type: "CASH_IN",
          amount: 1000,
          reason: "float",
          refType: null,
          refId: null,
          actorId: "cashier-1",
          authorizedBy: null,
          occurredAt: new Date("2026-10-07T10:00:00.000Z"),
        },
      };

      const application = await store.transaction((tx) => tx.applyFact(fact, SOURCE));

      expect(application).toBe("applied");
      expect(database.prepare("SELECT id, type, amount FROM cash_movements").all()).toEqual([
        { id: "generated-1", type: "CASH_IN", amount: 1000 },
      ]);
    });

    it("applies a sale fact with the sale writers, and a cancelled sale too", async () => {
      expect(
        await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE)),
      ).toBe("applied");
      expect(
        await store.transaction((tx) =>
          tx.applyFact(
            aCancelledSaleFact({
              id: "sale-2",
              lines: aCancelledSaleFact().sale.lines.map((line) => ({ ...line, id: "line-2" })),
            }),
            SOURCE,
          ),
        ),
      ).toBe("applied");

      expect(database.prepare("SELECT id, state FROM sales ORDER BY id").all()).toEqual([
        { id: "sale-1", state: "COMPLETED" },
        { id: "sale-2", state: "CANCELLED" },
      ]);
    });

    it("applies an opening count fact with the stock writers", async () => {
      const fact: SyncedFact = {
        kind: "opening_count_recorded",
        count: {
          movementId: "movement-1",
          productId: "product-1",
          counted: 6000,
          expiresOn: null,
          countedAt: new Date("2026-10-07T09:00:00.000Z"),
          actorId: "cashier-1",
        },
      };

      expect(await store.transaction((tx) => tx.applyFact(fact, SOURCE))).toBe("applied");

      expect(database.prepare("SELECT quantity FROM stock_balances").get()).toEqual({
        quantity: 6000,
      });
    });

    it("applies a clock correction with the clock correction writers", async () => {
      database
        .prepare(
          "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (12, 'factura_c', '2026-10-07T12:00:00.000Z')",
        )
        .run();
      const fact: SyncedFact = {
        kind: "clock_corrected",
        correction: {
          registerId: "register-new",
          pointOfSale: 12,
          documentType: "factura_c",
          previousReading: new Date("2026-10-07T12:00:00.000Z"),
          correctedReading: new Date("2026-10-05T12:00:00.000Z"),
          actorId: "cashier-1",
        },
      };

      expect(await store.transaction((tx) => tx.applyFact(fact, SOURCE))).toBe("applied");

      expect(database.prepare("SELECT reading FROM register_clock_marks").get()).toEqual({
        reading: "2026-10-05T12:00:00.000Z",
      });
    });

    it("applies the facts that follow a sale with the writers of the sale's void, receipt and gate", async () => {
      await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE));
      const facts: SyncedFact[] = [
        {
          kind: "sale_print_state_changed",
          printState: {
            saleId: "sale-1",
            printAttemptedAt: new Date("2026-10-07T10:00:05.000Z"),
            printedAt: null,
          },
        },
        {
          kind: "reprint_recorded",
          reprint: {
            saleId: "sale-1",
            orderNumber: 1,
            requestedBy: "cashier-1",
            authorizedBy: null,
            reason: { kind: "retry" },
            occurredAt: new Date("2026-10-07T10:30:00.000Z"),
          },
        },
        {
          kind: "fiscal_gate_failed",
          gateFailure: {
            saleId: "sale-1",
            reason: "issuer_identification_missing",
            evaluatedAt: new Date("2026-10-07T10:00:01.000Z"),
          },
        },
        aVoidedSaleFact({ id: "sale-1" }),
      ];

      for (const fact of facts) {
        expect(await store.transaction((tx) => tx.applyFact(fact, SOURCE))).toBe("applied");
      }

      expect(database.prepare("SELECT state FROM sales").get()).toEqual({ state: "VOIDED" });
      expect(count("sale_reprints")).toBe(1);
      expect(count("pre_emission_gate_outcomes")).toBe(1);
    });

    it("applies an offline fiscal document that carries its invoice with the live issuing writer", async () => {
      await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE));
      const fact: SyncedFact = {
        kind: "offline_fiscal_document_issued",
        document: {
          fiscalDocumentId: "document-1",
          saleId: "sale-1",
          registerId: "register-new",
          pointOfSale: 12,
          documentType: "factura_c",
          number: 7,
          issuedOn: "2026-10-07",
          generatedAt: new Date("2026-10-07T10:00:00.000Z"),
          generationStamp: "20261007070000",
          offlineAuthorizationCode: "12345678901234",
          fortnightStart: "2026-10-01",
          fortnightEnd: "2026-10-15",
          buyerDocumentType: 99,
          buyerDocumentNumber: 0,
          buyerTaxStatusCode: 5,
          total: 1500,
          netAmount: 1500,
          cause: "no_connectivity",
          invoice: {
            invoiceClass: "C",
            total: 1500,
            netAmount: 1500,
            vatAmount: 0,
            issuer: {
              legalName: FICTIONAL_LEGAL_NAME,
              cuit: FICTIONAL_CUIT,
              taxStatus: "MONOTRIBUTO",
              grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
              activityStartDate: "2020-01-01",
              version: 3,
            },
            buyerTaxStatusCode: 5,
            buyerTaxStatusDescription: "Consumidor Final",
          },
        },
      };

      expect(await store.transaction((tx) => tx.applyFact(fact, SOURCE))).toBe("applied");

      expect(database.prepare("SELECT id, number FROM offline_fiscal_documents").all()).toEqual([
        { id: "document-1", number: 7 },
      ]);
    });

    it("leaves an offline fiscal document that carries no invoice untouched, and says so", async () => {
      const fact: SyncedFact = {
        kind: "offline_fiscal_document_issued",
        document: {
          fiscalDocumentId: "document-1",
          saleId: "sale-1",
          registerId: "register-new",
          pointOfSale: 12,
          documentType: "factura_c",
          number: 7,
          issuedOn: "2026-10-07",
          generatedAt: new Date("2026-10-07T10:00:00.000Z"),
          generationStamp: "20261007100000",
          offlineAuthorizationCode: "12345678901234",
          fortnightStart: "2026-10-01",
          fortnightEnd: "2026-10-15",
          buyerDocumentType: 99,
          buyerDocumentNumber: 0,
          buyerTaxStatusCode: 5,
          total: 1500,
          netAmount: 1500,
          cause: "no_connectivity",
        },
      };

      expect(await store.transaction((tx) => tx.applyFact(fact, SOURCE))).toBe(
        "not_yet_applicable",
      );
      expect(count("offline_fiscal_documents")).toBe(0);
    });

    it("rebuilds the deferred-sale record of a sale with the short code it was issued with, and again without changing it", async () => {
      await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE));

      expect(
        await store.transaction((tx) => tx.applyFact(A_DEFERRED_SALE_RECORDED_FACT, SOURCE)),
      ).toBe("applied");
      expect(
        await store.transaction((tx) => tx.applyFact(A_DEFERRED_SALE_RECORDED_FACT, SOURCE)),
      ).toBe("applied");

      expect(database.prepare("SELECT id, sale_id, short_code FROM deferred_sales").all()).toEqual([
        { id: "deferred-1", sale_id: "sale-1", short_code: "7KQ4M2P9" },
      ]);
      expect(generated).toBe(0);
    });

    it("holds no deferred-sale record for a sale until it is rebuilt", async () => {
      await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE));

      expect(await store.transaction((tx) => tx.holdsDeferredSaleRecord("sale-1"))).toBe(false);

      await store.transaction((tx) => tx.applyFact(A_DEFERRED_SALE_RECORDED_FACT, SOURCE));

      expect(await store.transaction((tx) => tx.holdsDeferredSaleRecord("sale-1"))).toBe(true);
    });

    it("never puts a replenished event in the outbox, so it is not pushed again", async () => {
      await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE));

      expect(count("outbox")).toBe(0);
    });
  });

  describe("the credit note answer of a voided sale", () => {
    const CREDIT_NOTE = {
      creditNoteId: "note-1",
      saleId: "sale-1",
      total: 4800,
      receiverTaxStatusCode: 5,
      correctedVoucher: { voucherType: 11, pointOfSale: 7, number: 42 },
    };
    const ANSWER = {
      creditNoteId: "note-1",
      answeredAt: new Date("2026-10-07T10:30:00.000Z"),
      answer: {
        kind: "authorized" as const,
        pointOfSale: 7,
        number: 9,
        issuedOn: "2026-10-07",
        issuedAt: new Date("2026-10-07T10:29:00.000Z"),
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-17",
      },
    };

    async function replenishVoidedSale(tx: RegisterReplenishmentTransaction) {
      await tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE);
      await tx.applyFact({ ...aVoidedSaleFact({ id: "sale-1" }), creditNote: CREDIT_NOTE }, SOURCE);
    }

    it("is written as the credit note of the voided sale, with the cloud's authorization", async () => {
      await store.transaction(async (tx) => {
        await replenishVoidedSale(tx);
        await tx.recordCreditNoteAnswer(CREDIT_NOTE, ANSWER);
      });

      expect(
        database
          .prepare(
            "SELECT id, sale_id, state, number, authorization_code FROM sale_void_credit_notes",
          )
          .all(),
      ).toEqual([
        {
          id: "note-1",
          sale_id: "sale-1",
          state: "AUTHORIZED",
          number: 9,
          authorization_code: "74123456789012",
        },
      ]);
    });

    it("leaves no credit note behind, not even one in progress, when its transaction fails", async () => {
      await expect(
        store.transaction(async (tx) => {
          await replenishVoidedSale(tx);
          await tx.recordCreditNoteAnswer(CREDIT_NOTE, ANSWER);
          throw new Error("storage unavailable");
        }),
      ).rejects.toThrow("storage unavailable");

      expect(count("sale_void_credit_notes")).toBe(0);
    });
  });

  describe("a transaction", () => {
    it("leaves nothing behind when it fails", async () => {
      await expect(
        store.transaction(async (tx) => {
          await tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE);
          await tx.recordEventApplied("event-1");
          throw new Error("storage unavailable");
        }),
      ).rejects.toThrow("storage unavailable");

      expect(count("sales") + count("replenished_events")).toBe(0);
    });

    it("keeps what it did when it succeeds", async () => {
      await store.transaction(async (tx) => {
        await tx.recordEventApplied("event-1");
      });

      expect(count("replenished_events")).toBe(1);
    });
  });
});
