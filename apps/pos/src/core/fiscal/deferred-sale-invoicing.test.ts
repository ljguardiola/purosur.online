import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudClientDeps } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { CHAIN_KEY } from "../sync/test-support/sqlite-local-outbox";
import { createDeferredBacklogSerializer } from "./deferred-backlog-serializer";
import {
  createDeferredSaleInvoicing,
  startRegisterHealthChecks,
} from "./real-time-authorization-wiring";
import {
  insertBuyerTaxStatusSet,
  insertCompletedSale,
  insertDeferredSale,
  insertHealthCheck,
  insertIssuerIdentification,
  insertPointOfSale,
  insertSaleCompletedEvent,
  openFiscalDatabase,
} from "./test-support/real-time-authorization-database";
import { scriptedDeferrals } from "./test-support/scripted-deferrals";

const NOW = new Date("2026-09-30T12:05:02.000Z");
const AUTHORIZE_PATH = "/api/fiscal/authorize";

let database: LocalDatabase;

beforeEach(() => {
  database = openFiscalDatabase();
  insertHealthCheck(database);
  insertPointOfSale(database, 100);
  insertIssuerIdentification(database);
  insertBuyerTaxStatusSet(database);
});

afterEach(() => {
  database.close();
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function cloudAnswering(authorize: () => Promise<Response>) {
  const authorizations: string[] = [];
  const cloud: CloudClientDeps = {
    cloudUrl: "https://staging.purosur.online",
    fetch: async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      if (path === AUTHORIZE_PATH) {
        authorizations.push(path);
        return authorize();
      }
      return json({
        status: "ok",
        version: "abc1234",
        installation: { revoked: false },
        arca: { token_valid: true, probe_ok_at: "2026-09-30T12:05:00.000Z", reachable: true },
      });
    },
    sleep: async () => undefined,
  };
  return { cloud, authorizations };
}

const authorized = async () =>
  json({
    state: "AUTHORIZED",
    authorization_code: "75123456789012",
    authorization_code_due_on: "2026-10-10",
  });

function addPendingSale(index: number): void {
  const saleId = `sale-${index}`;
  insertCompletedSale(database, saleId);
  insertSaleCompletedEvent(database, saleId);
  insertDeferredSale(database, saleId, "fiscally_offline", {
    occurredAt: new Date(`2026-09-30T12:0${index}:00.000Z`),
  });
}

function invoicingWith(
  cloud: CloudClientDeps | undefined,
  serialize = createDeferredBacklogSerializer(),
) {
  return createDeferredSaleInvoicing({
    database,
    cloudClient: cloud,
    readDeviceToken: async () => "prefix.secret",
    now: () => NOW,
    ...scriptedDeferrals(),
    readOutboxChainKey: async () => CHAIN_KEY,
    reportFailure: () => undefined,
    serialize,
  });
}

function documents(): unknown {
  return database
    .prepare("SELECT sale_id, number, state FROM fiscal_documents ORDER BY number")
    .all();
}

describe("invoicing the deferred backlog up to a sale a customer asks for", () => {
  it("invoices the backlog up to that sale and no further", async () => {
    addPendingSale(1);
    addPendingSale(2);
    const { cloud } = cloudAnswering(authorized);

    const outcome = await invoicingWith(cloud)?.invoiceUpTo("sale-1");

    expect(outcome).toEqual({ kind: "invoiced" });
    expect(documents()).toEqual([{ sale_id: "sale-1", number: 101, state: "AUTHORIZED" }]);
  });

  it("answers that a sale with nothing to invoice is not pending", async () => {
    const { cloud } = cloudAnswering(authorized);

    expect(await invoicingWith(cloud)?.invoiceUpTo("sale-9")).toEqual({ kind: "not_pending" });
  });

  it("answers that it cannot be invoiced yet when the register cannot ask the cloud", async () => {
    addPendingSale(1);

    expect(await invoicingWith(undefined)?.invoiceUpTo("sale-1")).toEqual({
      kind: "not_yet",
      cause: "cannot_authorize",
    });
  });

  it("fails, rather than answering, when the outbox chain key cannot be read", async () => {
    addPendingSale(1);
    const { cloud } = cloudAnswering(authorized);
    const invoicing = createDeferredSaleInvoicing({
      database,
      cloudClient: cloud,
      readDeviceToken: async () => "prefix.secret",
      now: () => NOW,
      ...scriptedDeferrals(),
      readOutboxChainKey: async () => undefined,
      reportFailure: () => undefined,
      serialize: createDeferredBacklogSerializer(),
    });

    await expect(invoicing?.invoiceUpTo("sale-1")).rejects.toThrow("outbox chain key");
    expect(documents()).toEqual([]);
  });

  it("waits for the health check's catch-up that is running, then finds nothing left to invoice", async () => {
    addPendingSale(1);
    addPendingSale(2);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstAnswer = true;
    const { cloud, authorizations } = cloudAnswering(async () => {
      if (firstAnswer) {
        firstAnswer = false;
        await released;
      }
      return authorized();
    });
    const serialize = createDeferredBacklogSerializer();
    const scheduled: (() => void)[] = [];
    startRegisterHealthChecks({
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
      reportFailure: () => undefined,
      serialize,
    });
    scheduled[0]?.();
    await vi.waitFor(() => expect(authorizations).toHaveLength(1));

    let settled = false;
    const manual = invoicingWith(cloud, serialize)
      ?.invoiceUpTo("sale-2")
      .then((outcome) => {
        settled = true;
        return outcome;
      });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(authorizations).toHaveLength(1);

    release();

    expect(await manual).toEqual({ kind: "not_pending" });
    expect(documents()).toEqual([
      { sale_id: "sale-1", number: 101, state: "AUTHORIZED" },
      { sale_id: "sale-2", number: 102, state: "AUTHORIZED" },
    ]);
  });
});
