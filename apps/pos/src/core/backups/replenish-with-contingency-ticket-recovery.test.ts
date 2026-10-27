import { recordedPushes } from "@purosur/contracts/sync/test-support";
import { nextOfflineNumber, type PushedEvent } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOfflineSeries } from "../fiscal/sqlite-fiscal-series";
import {
  insertCompletedSale,
  insertOfflineNumberBlock,
  insertOfflinePointOfSale,
  OFFLINE_POINT_OF_SALE,
  openFiscalDatabase,
} from "../fiscal/test-support/real-time-authorization-database";
import type { CloudResponse } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { restorationOf } from "../register/test-support/restoration-of";
import { replenishRestoredRegisterStep } from "../sync/replenish-restored-register-step";
import { recoverContingencyTicketsStep } from "./recover-contingency-tickets-step";
import { replenishWithContingencyTicketRecovery } from "./replenish-with-contingency-ticket-recovery";

const PREDECESSOR = "2f0c7a9e-8d1b-4c53-9a77-3b5e1d2c4f60";
const CREDENTIALS = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: Buffer.alloc(32, 9).toString("base64url"),
};
const RECOVERY_PATH = "/api/devices/current/contingency-ticket-recovery";

function rescuedOfflineEvent(number: number): PushedEvent {
  const recorded = recordedPushes().find(
    ({ name }) => name === "offline-fiscal-document-with-its-invoice.json",
  );
  const template = recorded?.push.events.find(
    ({ event_type }) => event_type === "offline_fiscal_document_issued",
  );
  if (template === undefined) {
    throw new Error("the recorded push holds no offline fiscal document");
  }
  return {
    ...template,
    event_id: `01a15982-0000-7000-8000-${String(number).padStart(12, "0")}`,
    device_seq: number,
    payload: {
      ...template.payload,
      fiscal_document_id: `fiscal-document-${number}`,
      sale_id: `sale-${number}`,
      register_id: "register-1",
      number,
      generated_at: `2026-10-06T15:${String(number % 60).padStart(2, "0")}:00.000Z`,
    },
  };
}

function replenishmentPage(events: PushedEvent[]): CloudResponse {
  return {
    kind: "ok",
    body: {
      events: events.map((event) => ({ ...event, device_id: PREDECESSOR })),
      next: null,
      credit_notes: [],
      unrequested_credit_note_ids: [],
      unclear_deferrals: [],
      users: [],
    },
  };
}

let database: LocalDatabase;
let replenishmentAnswers: CloudResponse[];
let recoveryAnswers: CloudResponse[];
let replenishmentAsks: number;

beforeEach(() => {
  database = openFiscalDatabase();
  database.exec("UPDATE sync_state SET device_id = 'device-new'");
  for (const number of [300, 301]) {
    insertCompletedSale(database, `sale-${number}`);
  }
  insertOfflinePointOfSale(database, OFFLINE_POINT_OF_SALE, 0);
  insertOfflineNumberBlock(database, "block-1", 1, 1000, OFFLINE_POINT_OF_SALE);
  database.exec(
    `INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES ('${PREDECESSOR}', 10);
     INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('${PREDECESSOR}', 10);`,
  );
  replenishmentAnswers = [];
  recoveryAnswers = [];
  replenishmentAsks = 0;
});

afterEach(() => {
  database.close();
});

function post(path: string): Promise<CloudResponse> {
  const answers = path === RECOVERY_PATH ? recoveryAnswers : replenishmentAnswers;
  if (path !== RECOVERY_PATH) {
    replenishmentAsks += 1;
  }
  const answer = answers.shift();
  if (answer === undefined) {
    throw new Error(`the cloud was asked at ${path} for an answer nobody scripted`);
  }
  return Promise.resolve(answer);
}

function pass() {
  return replenishWithContingencyTicketRecovery({
    replenish: () =>
      replenishRestoredRegisterStep({
        database,
        readCredentials: async () => CREDENTIALS,
        post: (path) => post(path),
        ids: { next: () => crypto.randomUUID() },
        appVersion: "1.4.0",
      }),
    recover: () =>
      recoverContingencyTicketsStep({
        database,
        evidence: restorationOf,
        readCredentials: async () => CREDENTIALS,
        post: (path) => post(path),
      }),
    report: () => undefined,
    onFailure: (error) => {
      throw error;
    },
  })();
}

function documents() {
  return database
    .prepare("SELECT number, generated_at FROM offline_fiscal_documents ORDER BY number")
    .all();
}

function nextNumber() {
  return nextOfflineNumber(readOfflineSeries(database));
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT COUNT(*) AS total FROM ${table}`).get()
    ?.total as number;
}

const FINISHED: CloudResponse = { kind: "ok", body: { status: "finished" } };
const AWAITING: CloudResponse = { kind: "ok", body: { status: "awaiting" } };

describe("replenishing a restored register a second time once its contingency tickets are recovered", () => {
  it("applies the rescued offline documents and continues the numbering after the highest, keeping when each was generated", async () => {
    replenishmentAnswers.push(
      replenishmentPage([]),
      replenishmentPage([rescuedOfflineEvent(300), rescuedOfflineEvent(301)]),
    );
    recoveryAnswers.push(FINISHED);

    await pass();

    expect(documents()).toEqual([
      { number: 300, generated_at: "2026-10-06T15:00:00.000Z" },
      { number: 301, generated_at: "2026-10-06T15:01:00.000Z" },
    ]);
    expect(nextNumber()).toBe(302);
    expect(count("register_predecessor")).toBe(0);
    expect(restorationOf(database).evidence().recover_contingency_tickets).toBe("completed");
    expect(restorationOf(database).evidence().replenish).toBe("completed");
  });

  it("does not replenish a second time while the cloud's recovery is not finished", async () => {
    replenishmentAnswers.push(replenishmentPage([]));
    recoveryAnswers.push(AWAITING);

    await pass();

    expect(replenishmentAsks).toBe(1);
    expect(count("awaiting_contingency_ticket_recovery")).toBe(1);
    expect(documents()).toEqual([]);
  });

  it("blocks nothing when a ticket is missing: the ticket that was recovered still sets the numbering", async () => {
    replenishmentAnswers.push(replenishmentPage([]), replenishmentPage([rescuedOfflineEvent(301)]));
    recoveryAnswers.push(FINISHED);

    await pass();

    expect(documents()).toEqual([{ number: 301, generated_at: "2026-10-06T15:01:00.000Z" }]);
    expect(nextNumber()).toBe(302);
    expect(count("register_predecessor")).toBe(0);
  });

  it("runs cleanly again after a crash between handing the predecessor back and replenishing it", async () => {
    replenishmentAnswers.push(replenishmentPage([]), { kind: "unreachable" });
    recoveryAnswers.push(FINISHED);
    await pass();
    expect(count("awaiting_contingency_ticket_recovery")).toBe(0);
    expect(count("register_predecessor")).toBe(1);
    expect(restorationOf(database).evidence().replenish).toBe("pending");

    replenishmentAnswers.push(
      replenishmentPage([rescuedOfflineEvent(300), rescuedOfflineEvent(301)]),
    );
    await pass();

    expect(documents()).toHaveLength(2);
    expect(nextNumber()).toBe(302);
    expect(count("register_predecessor")).toBe(0);
    expect(restorationOf(database).evidence().recover_contingency_tickets).toBe("completed");
  });

  it("applies each rescued event once however many times the replenishment runs", async () => {
    const events = [rescuedOfflineEvent(300), rescuedOfflineEvent(301)];
    replenishmentAnswers.push(replenishmentPage([]), replenishmentPage(events));
    recoveryAnswers.push(FINISHED);
    await pass();
    const afterFirst = { documents: documents(), applied: count("replenished_events") };

    database.exec(
      `INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES ('${PREDECESSOR}', 10)`,
    );
    replenishmentAnswers.push(replenishmentPage(events));
    await pass();

    expect({ documents: documents(), applied: count("replenished_events") }).toEqual(afterFirst);
    expect(afterFirst.applied).toBe(2);
    expect(nextNumber()).toBe(302);
  });
});
