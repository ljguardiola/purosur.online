import { encodePinHash } from "@purosur/contracts";
import { aCancelledSaleFact, aCompletedSaleFact } from "@purosur/domain/sync/test-support";
import type { ReplenishedUser, SyncedFact } from "@purosur/domain/sync/use-cases";
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
      await store.transaction((tx) => tx.applyUsers([aUser()]));

      expect(await signInWith("1234")).toMatchObject({ kind: "signed_in" });
      expect(
        database.prepare("SELECT verifier FROM pin_verifiers WHERE user_id = 'user-1'").get(),
      ).toEqual({ verifier: derivePinVerifier(PEPPER, PIN_HASH) });
    });

    it("refuses a wrong PIN", async () => {
      await store.transaction((tx) => tx.applyUsers([aUser()]));

      expect(await signInWith("9999")).toMatchObject({ kind: "wrong_pin" });
    });

    it("derives the verifier of a user the snapshot already holds at the same version, whose verifier it lost", async () => {
      await store.transaction((tx) => tx.applyUsers([aUser()]));
      database.exec("DELETE FROM pin_verifiers");

      await store.transaction((tx) => tx.applyUsers([aUser()]));

      expect(await signInWith("1234")).toMatchObject({ kind: "signed_in" });
    });

    it("never overwrites a user with an older version of themselves", async () => {
      await store.transaction((tx) => tx.applyUsers([aUser({ version: 5, firstName: "Ana B" })]));

      await store.transaction((tx) => tx.applyUsers([aUser({ version: 2, firstName: "Ana A" })]));

      expect(database.prepare("SELECT first_name, version FROM users").get()).toEqual({
        first_name: "Ana B",
        version: 5,
      });
    });

    it("holds no verifier for a user who has no PIN", async () => {
      await store.transaction((tx) =>
        tx.applyUsers([aUser({ userId: "user-2", pinHash: null, salt: null })]),
      );

      expect(count("users")).toBe(1);
      expect(count("pin_verifiers")).toBe(0);
    });

    it("keeps an inactive user from signing in", async () => {
      await store.transaction((tx) => tx.applyUsers([aUser({ active: false })]));

      expect(await signInWith("1234")).not.toMatchObject({ kind: "signed_in" });
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

    it("leaves a fact it cannot apply yet untouched, and says so", async () => {
      const facts: SyncedFact[] = [
        {
          kind: "sale_print_state_changed",
          printState: { saleId: "sale-1", printAttemptedAt: new Date(), printedAt: null },
        },
        {
          kind: "fiscal_gate_failed",
          gateFailure: {
            saleId: "sale-1",
            reason: "issuer_identification_missing",
            evaluatedAt: new Date("2026-10-07T10:00:01.000Z"),
          },
        },
      ];

      for (const fact of facts) {
        expect(await store.transaction((tx) => tx.applyFact(fact, SOURCE))).toBe(
          "not_yet_applicable",
        );
      }
      expect(count("sales") + count("cash_movements")).toBe(0);
    });

    it("never puts a replenished event in the outbox, so it is not pushed again", async () => {
      await store.transaction((tx) => tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE));

      expect(count("outbox")).toBe(0);
    });
  });

  describe("a transaction", () => {
    it("leaves nothing behind when it fails", async () => {
      await expect(
        store.transaction(async (tx) => {
          await tx.applyUsers([aUser()]);
          await tx.applyFact(aCompletedSaleFact({ id: "sale-1" }), SOURCE);
          await tx.recordEventApplied("event-1");
          throw new Error("storage unavailable");
        }),
      ).rejects.toThrow("storage unavailable");

      expect(count("users") + count("sales") + count("replenished_events")).toBe(0);
    });

    it("keeps what it did when it succeeds", async () => {
      await store.transaction(async (tx) => {
        await tx.applyUsers([aUser()]);
        await tx.recordEventApplied("event-1");
      });

      expect(count("users")).toBe(1);
      expect(count("replenished_events")).toBe(1);
    });
  });
});
