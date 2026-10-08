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

describe("authorizing the sales a charge completes", () => {
  const charge = async () => ({ kind: "completed" as const, sale_id: "sale-1", total: 12_500 });

  function authorization(cloud: CloudClientDeps | undefined, failures: unknown[] = []) {
    return createRealTimeAuthorization({
      database,
      cloudClient: cloud,
      readDeviceToken: async () => "prefix.secret",
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

  it("asks the cloud to authorize the document of the sale a charge completed, with the device token", async () => {
    const { cloud, sent } = cloudAnswering(async () =>
      json({
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      }),
    );

    await authorization(cloud).afterCompletedSale(charge)?.({});

    await vi.waitFor(() => expect(storedState()).toEqual({ state: "AUTHORIZED" }));
    expect(sent).toEqual([
      { path: "/api/fiscal/authorize", authorization: "Bearer prefix.secret" },
    ]);
  });

  it("answers the cashier before the cloud answers", async () => {
    let answer: (response: Response) => void = () => undefined;
    const { cloud } = cloudAnswering(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );

    await expect(authorization(cloud).afterCompletedSale(charge)?.({})).resolves.toMatchObject({
      kind: "completed",
    });
    expect(storedState()).toEqual({ state: "REQUESTING" });

    answer(json({ state: "UNCLEAR" }));
    await vi.waitFor(() => expect(storedState()).toEqual({ state: "UNKNOWN" }));
  });

  it("leaves the document unclear when the cloud cannot be reached", async () => {
    const { cloud } = cloudAnswering(async () => {
      throw new TypeError("fetch failed");
    });

    await authorization(cloud).afterCompletedSale(charge)?.({});

    await vi.waitFor(() => expect(storedState()).toEqual({ state: "UNKNOWN" }));
  });

  it("reports a failure of the authorization without failing the charge", async () => {
    const { cloud } = cloudAnswering(async () => json({ state: "UNCLEAR" }));
    const failures: unknown[] = [];
    database.prepare("DROP TABLE register_health_checks").run();

    await expect(
      authorization(cloud, failures).afterCompletedSale(charge)?.({}),
    ).resolves.toMatchObject({ kind: "completed" });

    await vi.waitFor(() => expect(failures).toHaveLength(1));
  });

  it("leaves a charge as it is when the register cannot reach a cloud", () => {
    expect(authorization(undefined).afterCompletedSale(charge)).toBe(charge);
    expect(authorization(undefined).afterCompletedSale(undefined)).toBeUndefined();
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
