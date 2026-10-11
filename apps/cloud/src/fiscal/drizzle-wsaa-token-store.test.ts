import {
  renewWsaaToken,
  type WsaaToken,
  type WsaaTokenAnswer,
  type WsaaTokenRenewal,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { alerts, arcaVitalityChecks } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  DrizzleWsaaTokenStore,
  type ResumeWorkWaitingOnToken,
} from "./drizzle-wsaa-token-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const SERVICE = "wsfe";
const FINGERPRINT = "AB:CD:EF";
const ENVIRONMENT = "production";
const RETRY_INTERVAL_MINUTES = 15;

const ISSUED: WsaaToken = {
  token: "FICTIONAL-TOKEN-0001",
  sign: "FICTIONAL-SIGN-0001",
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 12 * HOUR_MS),
};

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function newStore(resumeWorkWaitingOnToken?: ResumeWorkWaitingOnToken, environment = ENVIRONMENT) {
  return new DrizzleWsaaTokenStore(testDatabase.db, {
    environment,
    ...(resumeWorkWaitingOnToken ? { resumeWorkWaitingOnToken } : {}),
  });
}

function held<TOutcome>(
  work: (renewal: WsaaTokenRenewal) => Promise<TOutcome>,
  service = SERVICE,
  fingerprint = FINGERPRINT,
  store = newStore(),
) {
  return store.holdRenewal(service, fingerprint, work);
}

function answering<TOutcome>(
  work: (answer: WsaaTokenAnswer) => Promise<TOutcome>,
  service = SERVICE,
  fingerprint = FINGERPRINT,
  store = newStore(),
) {
  return held((renewal) => renewal.recordAnswer(work), service, fingerprint, store);
}

function heldTicketAlertsOf(environment: string) {
  return testDatabase.db
    .select()
    .from(alerts)
    .where(and(eq(alerts.kind, "arca_wsaa_ticket_held"), eq(alerts.scope, environment)));
}

describe("DrizzleWsaaTokenStore", () => {
  it("finds no token before one is recorded", async () => {
    expect(await held((renewal) => renewal.persistedToken())).toBeNull();
  });

  it("finds the recorded token, with its times, by service and certificate", async () => {
    await answering((answer) => answer.recordIssuedToken(ISSUED));

    expect(await held((renewal) => renewal.persistedToken())).toEqual(ISSUED);
  });

  it("replaces the token of the same service and certificate", async () => {
    const newer = { ...ISSUED, token: "FICTIONAL-TOKEN-0002", sign: "FICTIONAL-SIGN-0002" };
    await answering((answer) => answer.recordIssuedToken(ISSUED));
    await answering((answer) => answer.recordIssuedToken(newer));

    expect(await held((renewal) => renewal.persistedToken())).toEqual(newer);
  });

  it("keeps a token for each certificate and each service", async () => {
    const other = { ...ISSUED, token: "FICTIONAL-TOKEN-0003" };
    await answering((answer) => answer.recordIssuedToken(ISSUED));
    await answering((answer) => answer.recordIssuedToken(other), SERVICE, "11:22:33");
    await answering((answer) => answer.recordIssuedToken(other), "ws_sr_padron_a13");

    expect(await held((renewal) => renewal.persistedToken())).toEqual(ISSUED);
    expect(await held((renewal) => renewal.persistedToken(), SERVICE, "11:22:33")).toEqual(other);
  });

  it("records nothing of the answer when the work fails after recording", async () => {
    await expect(
      answering(async (answer) => {
        await answer.recordIssuedToken(ISSUED);
        await answer.recordRefusal(NOW);
        await answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES);
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await held((renewal) => renewal.persistedToken())).toBeNull();
    expect(await held((renewal) => renewal.lastRefusal())).toBeNull();
    expect(await heldTicketAlertsOf(ENVIRONMENT)).toHaveLength(0);
  });

  it("finds no refusal before one is recorded", async () => {
    expect(await held((renewal) => renewal.lastRefusal())).toBeNull();
  });

  it("finds the moment of the last refusal, replacing the previous one", async () => {
    const later = new Date(NOW.getTime() + HOUR_MS);
    await answering((answer) => answer.recordRefusal(NOW));
    await answering((answer) => answer.recordRefusal(later));

    expect(await held((renewal) => renewal.lastRefusal())).toEqual(later);
  });

  it("keeps a refusal for each certificate and each service", async () => {
    await answering((answer) => answer.recordRefusal(NOW));

    expect(await held((renewal) => renewal.lastRefusal(), SERVICE, "11:22:33")).toBeNull();
    expect(await held((renewal) => renewal.lastRefusal(), "ws_sr_padron_a13")).toBeNull();
  });

  it("forgets the refusal once it is cleared", async () => {
    await answering((answer) => answer.recordRefusal(NOW));
    await answering((answer) => answer.clearRefusal());

    expect(await held((renewal) => renewal.lastRefusal())).toBeNull();
  });

  it("clears only the refusal of its own certificate", async () => {
    await answering((answer) => answer.recordRefusal(NOW), SERVICE, "11:22:33");
    await answering((answer) => answer.clearRefusal());

    expect(await held((renewal) => renewal.lastRefusal(), SERVICE, "11:22:33")).toEqual(NOW);
  });

  describe("the held-ticket alert", () => {
    it("opens one warning alert scoped to the ARCA environment, with the interval the ticket is asked for again", async () => {
      await answering((answer) => answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES));

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
      await answering((answer) => answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES));
      await answering((answer) =>
        answer.openHeldTicketAlert(new Date(NOW.getTime() + HOUR_MS), RETRY_INTERVAL_MINUTES),
      );

      expect(await heldTicketAlertsOf(ENVIRONMENT)).toHaveLength(1);
    });

    it("resolves the open alert at the moment given", async () => {
      const later = new Date(NOW.getTime() + HOUR_MS);
      await answering((answer) => answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES));
      await answering((answer) => answer.resolveHeldTicketAlert(later));

      const [alert] = await heldTicketAlertsOf(ENVIRONMENT);
      expect(alert?.resolvedAt).toEqual(later);
    });

    it("resolves nothing when no alert is open", async () => {
      await answering((answer) => answer.resolveHeldTicketAlert(NOW));

      expect(await heldTicketAlertsOf(ENVIRONMENT)).toEqual([]);
    });

    it("leaves the alert of another environment open", async () => {
      await answering(
        (answer) => answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES),
        SERVICE,
        FINGERPRINT,
        newStore(undefined, "homologation"),
      );
      await answering((answer) => answer.resolveHeldTicketAlert(NOW));

      const open = await testDatabase.db
        .select()
        .from(alerts)
        .where(and(eq(alerts.kind, "arca_wsaa_ticket_held"), isNull(alerts.resolvedAt)));
      expect(open.map(({ scope }) => scope)).toEqual(["homologation"]);
    });

    it("opens a new alert after the previous one resolved", async () => {
      await answering((answer) => answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES));
      await answering((answer) => answer.resolveHeldTicketAlert(NOW));
      await answering((answer) => answer.openHeldTicketAlert(NOW, RETRY_INTERVAL_MINUTES));

      expect(await heldTicketAlertsOf(ENVIRONMENT)).toHaveLength(2);
    });
  });

  describe("resuming the work that waits on a token", () => {
    it("does nothing by default", async () => {
      await expect(
        answering((answer) => answer.resumeWorkWaitingOnToken()),
      ).resolves.toBeUndefined();
    });

    it("runs the given resumption once, inside the transaction of the answer", async () => {
      const resume = vi.fn(async (transaction: Parameters<ResumeWorkWaitingOnToken>[0]) => {
        await transaction.execute(
          sql`insert into arca_vitality_checks (checked_at, ok) values (now(), true)`,
        );
      });

      await expect(
        answering(
          async (answer) => {
            await answer.resumeWorkWaitingOnToken();
            throw new Error("the operation failed");
          },
          SERVICE,
          FINGERPRINT,
          newStore(resume),
        ),
      ).rejects.toThrow("the operation failed");

      expect(resume).toHaveBeenCalledTimes(1);
      expect(await testDatabase.db.select().from(arcaVitalityChecks)).toHaveLength(0);
    });
  });

  it("holds the renewal again once the work failed", async () => {
    await expect(
      held(async () => {
        throw new Error("the operation failed");
      }),
    ).rejects.toThrow("the operation failed");

    expect(await held(async () => "held again")).toBe("held again");
  });

  it("makes a token due only for the certificate and service it was recorded for", async () => {
    await answering((answer) => answer.recordIssuedToken(ISSUED));
    let requests = 0;
    const authentication = {
      async requestToken() {
        requests += 1;
        return { kind: "issued" as const, token: { ...ISSUED, token: "FICTIONAL-TOKEN-0009" } };
      },
    };
    const renew = (certificateFingerprint: string) =>
      renewWsaaToken(
        { store: newStore(), authentication, clock: { now: () => NOW } },
        { service: SERVICE, certificateFingerprint },
      );

    expect(await renew(FINGERPRINT)).toEqual({ kind: "kept" });
    expect(await renew("11:22:33")).toEqual({ kind: "renewed" });
    expect(requests).toBe(1);
  });
});
