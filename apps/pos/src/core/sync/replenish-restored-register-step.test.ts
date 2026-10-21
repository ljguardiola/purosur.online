import { encodePinHash } from "@purosur/contracts";
import { recordedPushes } from "@purosur/contracts/sync/test-support";
import type { PushedEvent } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cashBalanceFor } from "../register/cash-session-requests";
import { addDiscount } from "../sales/test-support/sqlite-sale-ledger";
import {
  type ReplenishAttempt,
  replenishmentReportOf,
  replenishRestoredRegisterStep,
} from "./replenish-restored-register-step";

const PREDECESSOR = "2f0c7a9e-8d1b-4c53-9a77-3b5e1d2c4f60";
const CREDENTIALS = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: Buffer.alloc(32, 9).toString("base64url"),
};
const SALT = encodePinHash(new Uint8Array(16).fill(1));

function recordedEvents(): PushedEvent[] {
  const recorded = recordedPushes().find(({ name }) => name === "sales-moving-stock.json");
  if (recorded === undefined) {
    throw new Error("the recorded push is missing");
  }
  return recorded.push.events;
}

function firstRecordedEvent(): PushedEvent {
  const [first] = recordedEvents();
  if (first === undefined) {
    throw new Error("the recorded push has no events");
  }
  return first;
}

function applicableEvents(): PushedEvent[] {
  return recordedEvents().filter(({ event_type }) => event_type !== "cash_session_closed");
}

function frozenDiscountsOf(events: PushedEvent[]): Map<string, "PERCENT_OFF" | "BUY_N_PAY_M"> {
  const discounts = new Map<string, "PERCENT_OFF" | "BUY_N_PAY_M">();
  for (const { payload } of events) {
    const lines = Array.isArray(payload["lines"]) ? payload["lines"] : [];
    for (const line of lines) {
      const promotions =
        typeof line === "object" && line !== null && "promotions" in line ? line["promotions"] : [];
      for (const promotion of Array.isArray(promotions) ? promotions : []) {
        if (typeof promotion === "object" && promotion !== null && !Array.isArray(promotion)) {
          const id = promotion["discount_id"];
          const kind = promotion["kind"];
          if (typeof id === "string" && (kind === "PERCENT_OFF" || kind === "BUY_N_PAY_M")) {
            discounts.set(id, kind);
          }
        }
      }
    }
  }
  return discounts;
}

let database: LocalDatabase;
let requests: { path: string; bearerToken: string; body: unknown }[];

function pageOf(
  events: PushedEvent[],
  next: { device_id: string; device_seq: number } | null = null,
) {
  return {
    events: events.map((event) => ({ ...event, device_id: PREDECESSOR })),
    next,
    credit_notes: [],
    users: [
      {
        user_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
        first_name: "Ana",
        role_id: "7c2e9a4b-1d5f-4b83-a0c6-8f3d2e1b5a79",
        salt: SALT,
        pin_hash: "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu",
        active: true,
        version: 1,
      },
    ],
  };
}

function step(answers: CloudResponse[]) {
  let answered = 0;
  return replenishRestoredRegisterStep({
    database,
    readCredentials: async () => CREDENTIALS,
    post: async (path, bearerToken, body) => {
      requests.push({ path, bearerToken, body });
      const answer = answers[answered++];
      if (answer === undefined) {
        throw new Error("the cloud was asked for a page nobody scripted");
      }
      return answer;
    },
    ids: { next: () => crypto.randomUUID() },
  });
}

function ok(events: PushedEvent[], next = null as Parameters<typeof pageOf>[1]): CloudResponse {
  return { kind: "ok", body: pageOf(events, next) };
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT COUNT(*) AS total FROM ${table}`).get()
    ?.total as number;
}

beforeEach(() => {
  requests = [];
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  for (const [id, benefit] of [
    ["b5d2f7a1-8c40-4e96-a3b7-1f9e6c4d2a10", { kind: "PERCENT_OFF", percent: 10 }],
    ["c9f4b2e7-1a58-4d36-8e0b-4a7c3f9d1e17", { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 }],
  ] as const) {
    addDiscount(database, id, { kind: "PRODUCT", id: "product-1" }, benefit);
  }
  database
    .prepare("INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES (?, ?)")
    .run(PREDECESSOR, 0);
});

afterEach(() => {
  database.close();
});

describe("replenishing a restored register from the cloud", () => {
  it("does nothing for a register that was not restored, without asking the cloud", async () => {
    database.exec("DELETE FROM register_predecessor");

    expect(await step([])).toEqual({ kind: "nothing_to_replenish" });
    expect(requests).toEqual([]);
  });

  it("asks the cloud as the installation, naming the predecessor", async () => {
    await step([ok([])]);

    expect(requests).toEqual([
      {
        path: "/api/devices/current/reset",
        bearerToken: "prefix.secret",
        body: { predecessor_device_id: PREDECESSOR, last_acknowledged_seq: 0 },
      },
    ]);
  });

  it("applies the events of the sessions, sales and cash movements the snapshot lacks and forgets the predecessor", async () => {
    const outcome = await step([ok(applicableEvents())]);

    expect(outcome).toEqual({ kind: "replenished" });
    expect(count("register_predecessor")).toBe(0);
    expect(count("cash_sessions")).toBe(1);
    expect(
      database.prepare("SELECT state, COUNT(*) AS total FROM sales GROUP BY state").all(),
    ).toEqual([
      { state: "CANCELLED", total: 1 },
      { state: "COMPLETED", total: 3 },
    ]);
  });

  it("makes the open session expect the cash of everything that was replenished into it", async () => {
    await step([ok(applicableEvents())]);

    expect(cashBalanceFor(database)?.expected).toBe(10_400);
  });

  it("does not push again what it replenished", async () => {
    await step([ok(applicableEvents())]);

    expect(count("outbox")).toBe(0);
  });

  it("lets the cloud's users sign in from now on", async () => {
    await step([ok(applicableEvents())]);

    expect(count("pin_verifiers")).toBe(1);
  });

  it("applies nothing twice when the cloud serves the same events again after stopping halfway", async () => {
    const events = applicableEvents();
    const first = events.slice(0, 6);
    const last = events[5];
    const cursor = { device_id: PREDECESSOR, device_seq: last?.device_seq ?? 0 };

    const interrupted = await step([ok(first, cursor), { kind: "unreachable" }]);
    const afterFirstRun = {
      movements: count("cash_movements"),
      sales: count("sales"),
      stock: count("stock_movements"),
    };
    const outcome = await step([ok(first, cursor), ok(events.slice(6))]);

    expect(interrupted).toEqual({ kind: "unreachable" });
    expect(outcome).toEqual({ kind: "replenished" });
    expect(afterFirstRun.movements).toBeLessThan(count("cash_movements"));
    expect(cashBalanceFor(database)?.expected).toBe(10_400);
    expect(count("replenished_events")).toBe(events.length);
  });

  it("leaves an offline fiscal document, keeps the predecessor and says how many", async () => {
    const offline = recordedPushes()
      .flatMap(({ push }) => push.events)
      .find(({ event_type }) => event_type === "offline_fiscal_document_issued");
    if (offline === undefined) {
      throw new Error("no recorded push holds an offline fiscal document");
    }

    const outcome = await step([ok([...applicableEvents(), offline])]);

    expect(outcome).toEqual({ kind: "partially_replenished", unapplied: 1 });
    expect(count("register_predecessor")).toBe(1);
    expect(count("sales")).toBe(4);
    expect(count("pre_emission_gate_outcomes")).toBe(3);
  });

  it("replenishes a whole session of every event the register builds, its offline invoice included", async () => {
    const recorded = recordedPushes().find(
      ({ name }) => name === "offline-fiscal-document-with-its-invoice.json",
    );
    if (recorded === undefined) {
      throw new Error("the recorded push is missing");
    }
    const events = recorded.push.events;
    for (const [id, kind] of frozenDiscountsOf(events)) {
      if (database.prepare("SELECT 1 FROM discounts WHERE id = ?").get(id) !== undefined) {
        continue;
      }
      addDiscount(
        database,
        id,
        { kind: "PRODUCT", id: "product-1" },
        kind === "PERCENT_OFF"
          ? { kind: "PERCENT_OFF", percent: 10 }
          : { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
      );
    }

    const creditNotes = events.flatMap(({ event_type, payload }) => {
      const creditNote =
        event_type === "sale_voided"
          ? (payload as { credit_note: { id: string } | null }).credit_note
          : null;
      return creditNote === null
        ? []
        : [
            {
              credit_note_id: creditNote.id,
              answered_at: "2026-10-06T15:44:05.000Z",
              state: "AUTHORIZED",
              point_of_sale: 31,
              number: 1,
              issued_on: "2026-10-06",
              issued_at: "2026-10-06T15:44:01.000Z",
              authorization_code: "76543210987654",
              authorization_code_due_on: "2026-10-16",
            },
          ];
    });

    const outcome = await step([
      { kind: "ok", body: { ...pageOf(events), credit_notes: creditNotes } },
    ]);

    expect(outcome).toEqual({ kind: "replenished" });
    expect(count("register_predecessor")).toBe(0);
    expect(count("offline_fiscal_documents")).toBe(1);
    expect(count("sale_void_credit_notes")).toBe(1);
    expect(count("outbox")).toBe(0);
  });

  it("applies nothing of a page with an event it cannot read, and keeps the predecessor", async () => {
    const unreadable: PushedEvent = {
      ...firstRecordedEvent(),
      event_id: "01a12101-ffff-7000-8000-000000000099",
      device_seq: 99,
      schema_version: 99,
    };

    const outcome = await step([ok([...applicableEvents(), unreadable])]);

    expect(outcome).toMatchObject({ kind: "unreadable_event", eventId: unreadable.event_id });
    expect(count("cash_sessions") + count("sales") + count("replenished_events")).toBe(0);
    expect(count("register_predecessor")).toBe(1);
  });

  it("keeps the predecessor when the cloud refuses", async () => {
    const outcome = await step([
      {
        kind: "error",
        error: { code: "predecessor_not_revoked", message: "not revoked", details: [] },
      },
    ]);

    expect(outcome).toEqual({ kind: "refused", refusal: "predecessor_not_revoked" });
    expect(count("register_predecessor")).toBe(1);
  });

  it("does not run without an enrolled installation, a cloud or a local database", async () => {
    const deps = {
      database,
      readCredentials: async () => CREDENTIALS,
      post: async () => ({ kind: "unreachable" }) as const,
      ids: { next: () => "id" },
    };

    expect(
      await replenishRestoredRegisterStep({ ...deps, readCredentials: async () => undefined }),
    ).toEqual({ kind: "not_enrolled" });
    expect(await replenishRestoredRegisterStep({ ...deps, post: undefined })).toEqual({
      kind: "no_cloud",
    });
    expect(await replenishRestoredRegisterStep({ ...deps, database: undefined })).toEqual({
      kind: "no_local_database",
    });
  });
});

describe("what a replenishment attempt reports", () => {
  it.each<[string, ReplenishAttempt]>([
    ["nothing to replenish", { kind: "nothing_to_replenish" }],
    ["a finished replenishment", { kind: "replenished" }],
    ["an unreachable cloud", { kind: "unreachable" }],
    ["a register that is not enrolled", { kind: "not_enrolled" }],
    ["a register without a cloud", { kind: "no_cloud" }],
    ["a register without a local database", { kind: "no_local_database" }],
    ["a failure to reach the cloud", { kind: "failed", failure: { kind: "unreachable" } }],
  ])("nothing for %s", (_name, attempt) => {
    expect(replenishmentReportOf(attempt)).toBeUndefined();
  });

  it("an error for the cloud's refusal, which retrying will not change", () => {
    expect(replenishmentReportOf({ kind: "refused", refusal: "predecessor_not_revoked" })).toEqual({
      level: "error",
      message:
        "core: the cloud refused to replenish the restored register (predecessor_not_revoked), so it stays pending",
    });
  });

  it("an error for an event it cannot read", () => {
    expect(
      replenishmentReportOf({ kind: "unreadable_event", eventId: "event-9", reason: "garbled" }),
    ).toEqual({
      level: "error",
      message:
        "core: event event-9 cannot be read (garbled), so the restored register stays pending its replenishment",
    });
  });

  it("a warning for the events it cannot apply yet", () => {
    expect(replenishmentReportOf({ kind: "partially_replenished", unapplied: 3 })).toEqual({
      level: "warn",
      message:
        "core: 3 events of the restored register's predecessor cannot be applied yet, so its replenishment stays pending",
    });
  });

  it("a warning for a cloud answer it could not use", () => {
    expect(replenishmentReportOf({ kind: "failed", failure: { kind: "unreadable" } })).toEqual({
      level: "warn",
      message:
        "core: the cloud's replenishment of the restored register was refused or unreadable, so it will be asked again later",
    });
  });
});
