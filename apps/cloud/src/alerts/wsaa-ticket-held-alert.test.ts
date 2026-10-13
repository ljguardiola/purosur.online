import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { openWsaaTicketHeldAlert, resolveWsaaTicketHeldAlert } from "./wsaa-ticket-held-alert.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const LATER = new Date("2026-10-01T13:00:00.000Z");
const ENVIRONMENT = "production";
const RETRY_INTERVAL_MINUTES = 15;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function heldTicketAlertsOf(environment: string) {
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.kind, "arca_wsaa_ticket_held"), eq(alerts.scope, environment)));
}

describe("openWsaaTicketHeldAlert", () => {
  it("opens one warning alert scoped to the ARCA environment, with the interval the ticket is asked for again", async () => {
    await openWsaaTicketHeldAlert(db, ENVIRONMENT, RETRY_INTERVAL_MINUTES, NOW);

    const [alert, ...others] = await heldTicketAlertsOf(ENVIRONMENT);
    expect(others).toEqual([]);
    expect(alert).toMatchObject({
      level: "warning",
      detail: { retryIntervalMinutes: RETRY_INTERVAL_MINUTES },
      resolvedAt: null,
      escalateAt: null,
      openedAt: NOW,
    });
  });

  it("keeps a single open alert when it is opened again", async () => {
    await openWsaaTicketHeldAlert(db, ENVIRONMENT, RETRY_INTERVAL_MINUTES, NOW);
    await openWsaaTicketHeldAlert(db, ENVIRONMENT, RETRY_INTERVAL_MINUTES, LATER);

    expect(await heldTicketAlertsOf(ENVIRONMENT)).toHaveLength(1);
  });

  it("opens a new alert after the previous one resolved", async () => {
    await openWsaaTicketHeldAlert(db, ENVIRONMENT, RETRY_INTERVAL_MINUTES, NOW);
    await resolveWsaaTicketHeldAlert(db, ENVIRONMENT, NOW);
    await openWsaaTicketHeldAlert(db, ENVIRONMENT, RETRY_INTERVAL_MINUTES, LATER);

    expect(await heldTicketAlertsOf(ENVIRONMENT)).toHaveLength(2);
  });
});

describe("resolveWsaaTicketHeldAlert", () => {
  it("resolves the open alert of the environment at the moment given", async () => {
    await openWsaaTicketHeldAlert(db, ENVIRONMENT, RETRY_INTERVAL_MINUTES, NOW);

    await resolveWsaaTicketHeldAlert(db, ENVIRONMENT, LATER);

    const [alert] = await heldTicketAlertsOf(ENVIRONMENT);
    expect(alert?.resolvedAt).toEqual(LATER);
  });

  it("resolves nothing when no alert is open", async () => {
    await resolveWsaaTicketHeldAlert(db, ENVIRONMENT, NOW);

    expect(await heldTicketAlertsOf(ENVIRONMENT)).toEqual([]);
  });

  it("leaves the alert of another environment open", async () => {
    await openWsaaTicketHeldAlert(db, "homologation", RETRY_INTERVAL_MINUTES, NOW);

    await resolveWsaaTicketHeldAlert(db, ENVIRONMENT, NOW);

    const open = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "arca_wsaa_ticket_held"), isNull(alerts.resolvedAt)));
    expect(open.map(({ scope }) => scope)).toEqual(["homologation"]);
  });
});
