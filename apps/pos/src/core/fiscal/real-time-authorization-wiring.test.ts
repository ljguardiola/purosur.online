import { cloudError, cloudErrorStatus } from "@purosur/contracts";
import { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudClientDeps } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import {
  createRealTimeAuthorization,
  settleInterruptedAuthorizations,
  startRegisterHealthChecks,
} from "./real-time-authorization-wiring";
import {
  insertCompletedSale,
  insertDeferredSale,
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

function cloudAnswering(answer: (path: string) => Promise<Response>) {
  const sent: SentRequest[] = [];
  const cloud: CloudClientDeps = {
    cloudUrl: CLOUD_URL,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      sent.push({ path, authorization: request.headers.get("authorization") });
      return answer(path);
    },
    sleep: async () => undefined,
  };
  return { cloud, sent };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
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

describe("settling, as the register starts, the authorizations its last run left requesting", () => {
  beforeEach(() => {
    insertCompletedSale(database, "sale-1");
    insertFiscalDocument(database);
  });

  it("leaves the document unknown and routes its sale to the deferred flow for an unclear outcome", async () => {
    await settleInterruptedAuthorizations({ database, now: () => NOW, reportFailure: () => {} });

    expect(storedState()).toEqual({ state: "UNKNOWN" });
    expect(database.prepare("SELECT sale_id, reason, routed_at FROM deferred_sales").all()).toEqual(
      [{ sale_id: "sale-1", reason: "unclear_outcome", routed_at: NOW.toISOString() }],
    );
  });

  it("reports a failure without rejecting", async () => {
    const failures: unknown[] = [];
    database.prepare("DROP TABLE deferred_sales").run();

    await expect(
      settleInterruptedAuthorizations({
        database,
        now: () => NOW,
        reportFailure: (error) => failures.push(error),
      }),
    ).resolves.toBeUndefined();

    expect(failures).toHaveLength(1);
    expect(storedState()).toEqual({ state: "REQUESTING" });
  });

  it("settles none of them and reports it when settling one of them fails", async () => {
    insertCompletedSale(database, "sale-2");
    insertFiscalDocument(database, { id: "doc-2", saleId: "sale-2", pointOfSale: 13 });
    database
      .prepare(
        `INSERT INTO deferred_sales (sale_id, reason, routed_at)
         VALUES ('sale-2', 'unclear_outcome', '2026-09-30T12:05:01.000Z')`,
      )
      .run();
    const failures: unknown[] = [];

    await settleInterruptedAuthorizations({
      database,
      now: () => NOW,
      reportFailure: (error) => failures.push(error),
    });

    expect(failures).toHaveLength(1);
    expect(database.prepare("SELECT id, state FROM fiscal_documents ORDER BY id").all()).toEqual([
      { id: "doc-1", state: "REQUESTING" },
      { id: "doc-2", state: "REQUESTING" },
    ]);
    expect(database.prepare("SELECT sale_id FROM deferred_sales").all()).toEqual([
      { sale_id: "sale-2" },
    ]);
  });

  it("resolves at once for a register with no local database", async () => {
    await expect(
      settleInterruptedAuthorizations({
        database: undefined,
        now: () => NOW,
        reportFailure: () => {},
      }),
    ).resolves.toBeUndefined();
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

describe("applying the decisions of the documents left with an unclear outcome, as the register's health is checked", () => {
  const UNCLEAR_PATH = "/api/fiscal/unclear-outcomes";

  const healthy = () =>
    json({
      status: "ok",
      version: "abc1234",
      installation: { revoked: false },
      arca: { token_valid: true, probe_ok_at: "2026-09-30T12:05:00.000Z", reachable: true },
    });

  function ticking(unclearOutcome: () => Promise<Response>, failures: unknown[] = []) {
    const { cloud, sent } = cloudAnswering(async (path) =>
      path === UNCLEAR_PATH ? unclearOutcome() : healthy(),
    );
    const scheduled: { run: () => void; delayMs: number }[] = [];
    startRegisterHealthChecks({
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
    async function tick(): Promise<void> {
      const before = scheduled.length;
      scheduled[before - 1]?.run();
      await vi.waitFor(() => expect(scheduled).toHaveLength(before + 1));
    }
    return { sent, tick };
  }

  function leaveUnclear(index: number, state: "UNKNOWN" | "REQUESTING" = "UNKNOWN"): void {
    const saleId = `sale-${index}`;
    insertCompletedSale(database, saleId);
    insertSaleCompletedEvent(database, saleId);
    insertFiscalDocument(database, {
      id: `doc-${index}`,
      saleId,
      pointOfSale: 12 + index,
      number: 40 + index,
      state,
    });
    if (state === "UNKNOWN") {
      insertDeferredSale(database, saleId);
    }
  }

  function documentStates(): unknown {
    return database.prepare("SELECT id, state FROM fiscal_documents ORDER BY id").all();
  }

  it("asks the cloud nothing when no document is unclear", async () => {
    const { sent, tick } = ticking(async () => json({ state: "RELEASED" }));

    await tick();

    expect(sent.map(({ path }) => path)).toEqual(["/api/health"]);
  });

  it("asks once about each unclear document, with the device token, after recording the health check", async () => {
    leaveUnclear(1);
    leaveUnclear(2);
    const { sent, tick } = ticking(async () => json({ state: "PENDING" }));

    await tick();

    expect(sent).toEqual([
      { path: "/api/health", authorization: "Bearer prefix.secret" },
      { path: UNCLEAR_PATH, authorization: "Bearer prefix.secret" },
      { path: UNCLEAR_PATH, authorization: "Bearer prefix.secret" },
    ]);
  });

  it("frees the number of a released document and keeps its sale deferred", async () => {
    leaveUnclear(1);
    const { tick } = ticking(async () => json({ state: "RELEASED" }));

    await tick();

    expect(documentStates()).toEqual([{ id: "doc-1", state: "RELEASED" }]);
    expect(database.prepare("SELECT satisfied_at FROM deferred_sales").all()).toEqual([
      { satisfied_at: null },
    ]);
  });

  it("authorizes an adopted document and satisfies the deferred record of its sale", async () => {
    leaveUnclear(1);
    const { tick } = ticking(async () =>
      json({
        state: "ADOPTED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-10",
      }),
    );

    await tick();

    expect(
      database
        .prepare(
          `SELECT fiscal_documents.state, fiscal_documents.authorization_code,
                  deferred_sales.satisfied_by_fiscal_document_id AS satisfied_by
           FROM fiscal_documents JOIN deferred_sales ON deferred_sales.sale_id = fiscal_documents.sale_id`,
        )
        .all(),
    ).toEqual([
      { state: "AUTHORIZED", authorization_code: "75123456789012", satisfied_by: "doc-1" },
    ]);
  });

  it("keeps the number of a conflicting document consumed", async () => {
    leaveUnclear(1);
    const { tick } = ticking(async () => json({ state: "CONFLICTING" }));

    await tick();

    expect(documentStates()).toEqual([{ id: "doc-1", state: "CONFLICTING" }]);
  });

  it("applies a rejection the tax authority had already given as a timely one", async () => {
    leaveUnclear(1);
    const { tick } = ticking(async () =>
      json({ state: "REJECTED", rejection_codes: [10015], rejection_class: "content" }),
    );

    await tick();

    expect(documentStates()).toEqual([{ id: "doc-1", state: "REJECTED" }]);
    expect(database.prepare("SELECT reason FROM deferred_sales").all()).toEqual([
      { reason: "rejected" },
    ]);
  });

  it("changes nothing while the decision is pending and asks again on the next tick", async () => {
    leaveUnclear(1);
    const { sent, tick } = ticking(async () => json({ state: "PENDING" }));

    await tick();
    await tick();

    expect(documentStates()).toEqual([{ id: "doc-1", state: "UNKNOWN" }]);
    expect(sent.filter(({ path }) => path === UNCLEAR_PATH)).toHaveLength(2);
  });

  it.each([
    ["the cloud cannot be reached", async () => Promise.reject(new TypeError("fetch failed"))],
    ["the cloud's body is not one it answers", async () => json({ state: "SOMETHING_ELSE" })],
    [
      "the cloud refuses",
      async () =>
        json(
          cloudError("not_found", "that point of sale is not this register's"),
          cloudErrorStatus("not_found"),
        ),
    ],
  ])("changes nothing when %s", async (_name, answer) => {
    leaveUnclear(1);
    const failures: unknown[] = [];
    const { tick } = ticking(answer, failures);

    await tick();

    expect(documentStates()).toEqual([{ id: "doc-1", state: "UNKNOWN" }]);
    expect(failures).toEqual([]);
  });

  it("resolves by asking a document a stopped register left requesting", async () => {
    leaveUnclear(1, "REQUESTING");
    await settleInterruptedAuthorizations({ database, now: () => NOW, reportFailure: () => {} });
    expect(documentStates()).toEqual([{ id: "doc-1", state: "UNKNOWN" }]);
    const { tick } = ticking(async () => json({ state: "RELEASED" }));

    await tick();

    expect(documentStates()).toEqual([{ id: "doc-1", state: "RELEASED" }]);
  });

  it("settles the other documents and reports the one whose settling failed", async () => {
    leaveUnclear(1);
    leaveUnclear(2);
    database.prepare("DELETE FROM deferred_sales WHERE sale_id = 'sale-1'").run();
    const failures: unknown[] = [];
    const { tick } = ticking(
      async () =>
        json({
          state: "ADOPTED",
          authorization_code: "75123456789012",
          authorization_code_due_on: "2026-10-10",
        }),
      failures,
    );

    await tick();

    expect(failures).toHaveLength(1);
    expect(documentStates()).toEqual([
      { id: "doc-1", state: "UNKNOWN" },
      { id: "doc-2", state: "AUTHORIZED" },
    ]);
  });

  it("applies the decisions even when recording the health check failed, reporting its failure", async () => {
    leaveUnclear(1);
    const failures: unknown[] = [];
    const { tick } = ticking(async () => json({ state: "RELEASED" }), failures);
    database.prepare("DROP TABLE register_health_checks").run();

    await tick();

    expect(failures.length).toBeGreaterThan(0);
    expect(documentStates()).toEqual([{ id: "doc-1", state: "RELEASED" }]);
  });

  it("keeps checking the register's health when applying the decisions failed", async () => {
    leaveUnclear(1);
    database.prepare("DROP TABLE deferred_sales").run();
    const failures: unknown[] = [];
    const { tick } = ticking(
      async () =>
        json({
          state: "ADOPTED",
          authorization_code: "75123456789012",
          authorization_code_due_on: "2026-10-10",
        }),
      failures,
    );

    await tick();

    expect(failures.length).toBeGreaterThan(0);
    expect(database.prepare("SELECT count(*) AS total FROM register_health_checks").get()).toEqual({
      total: 1,
    });
  });
});
