import { encodePinHash } from "@purosur/contracts";
import type { FiscalEmissionMode } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { createContingencyRecordingWiring } from "./contingency-recording-wiring";
import { restorationOf } from "./test-support/restoration-of";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-10-12T12:00:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const CLOSER_PIN = "1234";
const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let failures: unknown[];
let nextId: number;

function wiring() {
  return createContingencyRecordingWiring({
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === CLOSER_PIN ? PIN_HASH : "hash-of-another-pin"),
      now: () => NOW,
    }),
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
    ids: {
      next: () => {
        nextId += 1;
        return `id-${nextId}`;
      },
    },
    readOutboxChainKey: async () => CHAIN_KEY,
    readMode: () => OFFLINE,
    restorationOf,
    reportFailure: (error) => failures.push(error),
  });
}

function addPerson(id: string, permissions: string[]): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)")
    .run(`role-${id}`, `role-${id}`);
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(`role-${id}`, key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ada', ?, ?, 1, 1)",
    )
    .run(id, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

function contingencyEvents(): string[] {
  return database
    .prepare<[], { event_type: string }>(
      "SELECT event_type FROM outbox WHERE event_type LIKE 'contingency_%' ORDER BY device_seq",
    )
    .all()
    .map((row) => row.event_type);
}

async function openedSession(contingency: ReturnType<typeof wiring>): Promise<string> {
  const outcome = await contingency.openCashSession?.(5000);
  if (outcome?.kind !== "opened" || outcome.cash_session === null) {
    throw new Error("the session was not opened");
  }
  await vi.waitFor(() => expect(contingencyEvents()).toContain("contingency_entered"));
  return outcome.cash_session.id;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  addPerson("u1", ["sell_and_charge"]);
  addPerson("u9", ["close_anothers_register_session"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
  failures = [];
  nextId = 0;
});

afterEach(() => {
  database.close();
});

describe("the register's contingency recording wiring", () => {
  it("starts an interval when a cash session opens while the register is fiscally offline", async () => {
    const contingency = wiring();

    expect(await contingency.openCashSession?.(5000)).toMatchObject({ kind: "opened" });

    await vi.waitFor(() =>
      expect(contingencyEvents()).toEqual(["contingency_reporting_started", "contingency_entered"]),
    );
    expect(failures).toEqual([]);
  });

  it("ends the interval when the cash session closes", async () => {
    const contingency = wiring();
    const sessionId = await openedSession(contingency);

    expect(await contingency.closeCashSession?.(sessionId, 5000)).toMatchObject({
      kind: "closed",
    });

    await vi.waitFor(() => expect(contingencyEvents()).toContain("contingency_left"));
  });

  it("ends the interval when a locked register's cash session is closed with another person's PIN", async () => {
    const contingency = wiring();
    const sessionId = await openedSession(contingency);
    signedInPerson.clear();

    expect(
      await contingency.closeLockedCashSession?.(sessionId, 5000, {
        user_id: "u9",
        pin: CLOSER_PIN,
      }),
    ).toMatchObject({ kind: "closed" });

    await vi.waitFor(() => expect(contingencyEvents()).toContain("contingency_left"));
  });

  it("ends, on startup, an interval left open when the register stopped", async () => {
    await openedSession(wiring());

    await wiring().startup();

    expect(contingencyEvents()).toEqual([
      "contingency_reporting_started",
      "contingency_entered",
      "contingency_left",
      "contingency_entered",
    ]);
  });
});
