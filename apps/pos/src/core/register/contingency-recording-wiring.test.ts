import { encodePinHash } from "@purosur/contracts";
import type { FiscalEmissionMode } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import { readFiscalEmissionModeIn } from "../fiscal/sqlite-fiscal-emission-mode";
import {
  insertOfflineAuthorizationCode,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  insertPointOfSale,
  OFFLINE_POINT_OF_SALE,
} from "../fiscal/test-support/real-time-authorization-database";
import { scriptedDeferrals } from "../fiscal/test-support/scripted-deferrals";
import type { CloudClientDeps } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  type ContingencyRecordingWiringDeps,
  createContingencyRecordingWiring,
} from "./contingency-recording-wiring";
import { restorationOf } from "./test-support/restoration-of";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-10-12T12:00:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const CLOSER_PIN = "1234";
const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };
const REAL_TIME: FiscalEmissionMode = { kind: "real_time" };

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let failures: unknown[];
let nextId: number;
let mode: FiscalEmissionMode;

function wiring(overrides: Partial<ContingencyRecordingWiringDeps> = {}) {
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
    readMode: () => mode,
    restorationOf,
    reportFailure: (error) => failures.push(error),
    authorizeSale: async () => undefined,
    checkEnrollmentStanding: () => undefined,
    ...overrides,
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
  mode = OFFLINE;
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

  it("starts an interval when a sale's authorization leaves the register fiscally offline", async () => {
    mode = REAL_TIME;
    const authorized: string[] = [];
    const contingency = wiring({
      authorizeSale: async (saleId) => {
        authorized.push(saleId);
        mode = OFFLINE;
      },
    });
    await contingency.openCashSession?.(5000);
    await vi.waitFor(() => expect(contingencyEvents()).toEqual(["contingency_reporting_started"]));

    await contingency.authorizeSale("sale-1");

    expect(authorized).toEqual(["sale-1"]);
    await vi.waitFor(() =>
      expect(contingencyEvents()).toEqual(["contingency_reporting_started", "contingency_entered"]),
    );
  });

  it("evaluates the register's contingency again each time its enrollment standing is checked", async () => {
    mode = REAL_TIME;
    const checked = vi.fn();
    const contingency = wiring({ checkEnrollmentStanding: checked });
    await contingency.openCashSession?.(5000);
    await vi.waitFor(() => expect(contingencyEvents()).toEqual(["contingency_reporting_started"]));
    mode = OFFLINE;

    contingency.checkEnrollmentStanding();

    expect(checked).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(contingencyEvents()).toEqual(["contingency_reporting_started", "contingency_entered"]),
    );
  });

  it("starts an interval when a health check finds the tax authority unreachable, and ends it when the next one reaches it", async () => {
    insertPointOfSale(database, 40);
    insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
    insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
    insertOfflineAuthorizationCode(database, {
      fortnightStart: "2026-10-01",
      fortnightEnd: "2026-10-15",
    });
    let reachable = false;
    const cloud: CloudClientDeps = {
      cloudUrl: "https://staging.purosur.online",
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            version: "abc1234",
            installation: { revoked: false },
            arca: { token_valid: true, probe_ok_at: NOW.toISOString(), reachable },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      sleep: async () => undefined,
    };
    const contingency = wiring({
      readMode: (local) => readFiscalEmissionModeIn(local, NOW, fixedZoneRulesSource()),
    });
    mode = REAL_TIME;
    const realTime = wiring();
    await realTime.openCashSession?.(5000);
    await vi.waitFor(() => expect(contingencyEvents()).toEqual(["contingency_reporting_started"]));
    const scheduled: (() => void)[] = [];
    const afterCheck = vi.fn();

    contingency.startHealthChecks({
      zoneRules: fixedZoneRulesSource(),
      database,
      cloudClient: cloud,
      readDeviceToken: async () => "prefix.secret",
      now: () => NOW,
      scheduleNext: (run) => {
        scheduled.push(run);
        return () => undefined;
      },
      ...scriptedDeferrals(),
      readOutboxChainKey: async () => CHAIN_KEY,
      reportFailure: (error) => failures.push(error),
      afterCheck,
    });
    scheduled[0]?.();

    await vi.waitFor(() =>
      expect(contingencyEvents()).toEqual(["contingency_reporting_started", "contingency_entered"]),
    );
    expect(afterCheck).toHaveBeenCalledTimes(1);

    reachable = true;
    await vi.waitFor(() => expect(scheduled).toHaveLength(2));
    scheduled[1]?.();

    await vi.waitFor(() =>
      expect(contingencyEvents()).toEqual([
        "contingency_reporting_started",
        "contingency_entered",
        "contingency_left",
      ]),
    );
    expect(failures).toEqual([]);
  });
});
