import { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudClientDeps } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import {
  createRealTimeAuthorization,
  startRegisterHealthChecks,
} from "./real-time-authorization-wiring";
import {
  insertCompletedSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertSaleCompletedEvent,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";

const NOW = new Date("2026-09-30T12:05:02.000Z");
const CLOUD_URL = "https://staging.purosur.online";

let database: LocalDatabase;

interface SentRequest {
  path: string;
  authorization: string | null;
}

function cloudAnswering(answer: () => Promise<Response>) {
  const sent: SentRequest[] = [];
  const cloud: CloudClientDeps = {
    cloudUrl: CLOUD_URL,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      sent.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
      });
      return answer();
    },
    sleep: async () => undefined,
  };
  return { cloud, sent };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function storedState(): unknown {
  return database.prepare("SELECT state FROM fiscal_documents WHERE id = 'doc-1'").get();
}

beforeEach(() => {
  database = openFiscalDatabase();
});

afterEach(() => {
  database.close();
});

describe("authorizing a completed sale in real time", () => {
  function authorization(
    cloud: CloudClientDeps | undefined,
    failures: unknown[] = [],
    readDeviceToken: () => Promise<string | undefined> = async () => "prefix.secret",
  ) {
    return createRealTimeAuthorization({
      database,
      cloudClient: cloud,
      readDeviceToken,
      now: () => NOW,
      reportFailure: (error) => failures.push(error),
    });
  }

  beforeEach(() => {
    insertCompletedSale(database, "sale-1");
    insertSaleCompletedEvent(database, "sale-1");
    insertFiscalDocument(database);
    insertHealthCheck(database);
  });

  it("asks the cloud to authorize the document of the sale, with the device token, and settles it before resolving", async () => {
    const { cloud, sent } = cloudAnswering(async () =>
      json({
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      }),
    );

    await authorization(cloud).authorizeSale("sale-1");

    expect(storedState()).toEqual({ state: "AUTHORIZED" });
    expect(sent).toEqual([
      { path: "/api/fiscal/authorize", authorization: "Bearer prefix.secret" },
    ]);
  });

  it("leaves the document unclear when the cloud cannot be reached", async () => {
    const { cloud } = cloudAnswering(async () => {
      throw new TypeError("fetch failed");
    });

    await authorization(cloud).authorizeSale("sale-1");

    expect(storedState()).toEqual({ state: "UNKNOWN" });
  });

  it("settles the document as unclear and reports it when asking the cloud fails", async () => {
    const { cloud } = cloudAnswering(async () => json({ state: "UNCLEAR" }));
    const failure = new Error("the credentials cannot be read");
    const failures: unknown[] = [];

    await authorization(cloud, failures, async () => {
      throw failure;
    }).authorizeSale("sale-1");

    expect(failures).toEqual([failure]);
    expect(storedState()).toEqual({ state: "UNKNOWN" });
  });

  it("reports a failure of the authorization without rejecting", async () => {
    const { cloud } = cloudAnswering(async () => json({ state: "UNCLEAR" }));
    const failures: unknown[] = [];
    database.prepare("DROP TABLE register_health_checks").run();

    await expect(authorization(cloud, failures).authorizeSale("sale-1")).resolves.toBeUndefined();

    expect(failures.length).toBeGreaterThan(0);
  });

  it("settles the document as unclear when the register cannot reach a cloud", async () => {
    await expect(authorization(undefined).authorizeSale("sale-1")).resolves.toBeUndefined();

    expect(storedState()).toEqual({ state: "UNKNOWN" });
  });

  it("resolves for a sale with no document waiting", async () => {
    const { cloud, sent } = cloudAnswering(async () => json({ state: "UNCLEAR" }));

    await expect(authorization(cloud).authorizeSale("another-sale")).resolves.toBeUndefined();

    expect(sent).toEqual([]);
  });

  it("resolves at once for a register with no local database", async () => {
    const withoutDatabase = createRealTimeAuthorization({
      database: undefined,
      cloudClient: undefined,
      readDeviceToken: async () => undefined,
      now: () => NOW,
      reportFailure: () => undefined,
    });

    await expect(withoutDatabase.authorizeSale("sale-1")).resolves.toBeUndefined();
  });
});

describe("the register's health checks", () => {
  function monitoring(cloud: CloudClientDeps | undefined, failures: unknown[] = []) {
    const scheduled: { run: () => void; delayMs: number }[] = [];
    const stop = startRegisterHealthChecks({
      database,
      cloudClient: cloud,
      readDeviceToken: async () => "prefix.secret",
      now: () => NOW,
      scheduleNext: (run, delayMs) => {
        scheduled.push({ run, delayMs });
        return () => undefined;
      },
      reportFailure: (error) => failures.push(error),
    });
    return { scheduled, stop };
  }

  const healthy = () =>
    json({
      status: "ok",
      version: "abc1234",
      installation: { revoked: false },
      arca: { token_valid: true, probe_ok_at: "2026-09-30T12:05:00.000Z", reachable: true },
    });

  it("records what the cloud's health says, then checks again every interval", async () => {
    const { cloud, sent } = cloudAnswering(async () => healthy());
    const { scheduled } = monitoring(cloud);
    expect(scheduled.map((timer) => timer.delayMs)).toEqual([0]);

    scheduled[0]?.run();

    await vi.waitFor(() =>
      expect(
        database.prepare("SELECT count(*) AS total FROM register_health_checks").get(),
      ).toEqual({ total: 1 }),
    );
    expect(sent).toEqual([{ path: "/api/health", authorization: "Bearer prefix.secret" }]);
    await vi.waitFor(() =>
      expect(scheduled.map((timer) => timer.delayMs)).toEqual([
        0,
        REGISTER_HEALTH_CHECK_INTERVAL_MS,
      ]),
    );
    expect(
      database
        .prepare("SELECT checked_at, token_valid, arca_reachable FROM register_health_checks")
        .get(),
    ).toEqual({ checked_at: NOW.toISOString(), token_valid: 1, arca_reachable: 1 });
  });

  it("records nothing when the cloud cannot be reached", async () => {
    const { cloud } = cloudAnswering(async () => {
      throw new TypeError("fetch failed");
    });
    const { scheduled } = monitoring(cloud);

    scheduled[0]?.run();

    await vi.waitFor(() => expect(scheduled).toHaveLength(2));
    expect(database.prepare("SELECT count(*) AS total FROM register_health_checks").get()).toEqual({
      total: 0,
    });
  });

  it("starts no checks for a register that cannot reach a cloud", () => {
    const { scheduled, stop } = monitoring(undefined);

    expect(scheduled).toEqual([]);
    expect(stop).toBeUndefined();
  });
});
