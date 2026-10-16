import {
  type AuthorizeFiscalDocumentPorts,
  authorizeFiscalDocument,
  FiscalDocumentAlreadyRecorded,
  type FiscalDocumentSolicitation,
  type SolicitationAnswer,
  type TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzlePointOfSaleLanes } from "./drizzle-point-of-sale-lanes.js";
import { DrizzleUnclearOutcomeLanes } from "./drizzle-unclear-outcome-lanes.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
  RECEIVED_AT,
} from "./test-support/authorization-request-fixtures.js";

const TOKEN = {
  token: "FICTIONAL-TOKEN",
  sign: "FICTIONAL-SIGN",
  issuedAt: RECEIVED_AT,
  expiresAt: new Date(RECEIVED_AT.getTime() + 60_000),
};

const ABANDONED_AT = new Date("2026-10-06T15:00:30.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("unclear_outcome_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

class HeldTaxAuthority implements TaxAuthorityInvoicing {
  readonly started: number[] = [];
  private readonly releases = new Map<number, (answer: SolicitationAnswer) => void>();

  solicit({ number }: FiscalDocumentSolicitation): Promise<SolicitationAnswer> {
    this.started.push(number);
    return new Promise((resolve) => this.releases.set(number, resolve));
  }

  release(number: number): void {
    this.releases.get(number)?.({ kind: "no_answer", rejections: [] });
  }

  async untilStarted(count: number): Promise<void> {
    await vi.waitFor(() => expect(this.started.length).toBeGreaterThanOrEqual(count));
  }
}

function unclearLanes() {
  return new DrizzleUnclearOutcomeLanes(
    postgresDedicatedConnections(sql),
    async () => {},
    async () => {},
  );
}

function authorizationPorts(taxAuthority: TaxAuthorityInvoicing): AuthorizeFiscalDocumentPorts {
  return {
    lanes: new DrizzlePointOfSaleLanes(
      postgresDedicatedConnections(sql),
      async () => {},
      async () => {},
      async () => {},
    ),
    clock: { now: () => RECEIVED_AT },
    tokens: { validToken: async () => TOKEN },
    taxAuthority,
  };
}

function authorize(
  ports: AuthorizeFiscalDocumentPorts,
  registerId: string,
  pointOfSale: number,
  number: number,
) {
  const record = authorizationRequestRecord(registerId, { pointOfSale, number });
  return authorizeFiscalDocument(ports, {
    registerId,
    receivedAt: RECEIVED_AT,
    request: {
      fiscalDocumentId: record.fiscalDocumentId,
      saleId: record.saleId,
      pointOfSale,
      number,
      issuedOn: record.issuedOn,
      total: record.total,
      buyerTaxStatusCode: record.buyerTaxStatusCode,
      timeoutMs: 5_000,
      roundTripMedianMs: 200,
      saleEvent: record.saleEvent,
    },
  });
}

function holdLane(pointOfSale: number) {
  let leaveLane: () => void = () => {};
  let entered: () => void = () => {};
  const inLane = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finished = unclearLanes().inPointOfSaleLane(pointOfSale, async () => {
    entered();
    await new Promise<void>((resolve) => {
      leaveLane = resolve;
    });
  });
  return { inLane, finished, leave: () => leaveLane() };
}

describe("the unclear outcome lanes on a real Postgres", () => {
  it("waits for a call in flight at the point of sale, and enters the lane once it ends", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 31,
      name: "caja-in-flight",
    });
    const taxAuthority = new HeldTaxAuthority();
    const entered = vi.fn();

    const authorization = authorize(authorizationPorts(taxAuthority), registerId, 31, 100);
    await taxAuthority.untilStarted(1);
    const decision = unclearLanes().inPointOfSaleLane(31, async () => entered());
    await waitForLockWaiters(sql, 1);

    expect(entered).not.toHaveBeenCalled();

    taxAuthority.release(100);
    await authorization;
    await decision;
    expect(entered).toHaveBeenCalledTimes(1);
  });

  it("holds the point of sale's lane while it works, so a request waits for it", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 32,
      name: "caja-deciding",
    });
    const taxAuthority = new HeldTaxAuthority();
    const decision = holdLane(32);
    await decision.inLane;

    const authorization = authorize(authorizationPorts(taxAuthority), registerId, 32, 200);
    await waitForLockWaiters(sql, 1);

    expect(taxAuthority.started).toEqual([]);

    decision.leave();
    await decision.finished;
    await taxAuthority.untilStarted(1);
    taxAuthority.release(200);
    await authorization;
  });

  it("lets lanes of different points of sale work together", async () => {
    const first = holdLane(33);
    await first.inLane;

    await expect(unclearLanes().inPointOfSaleLane(34, async () => "other")).resolves.toBe("other");

    first.leave();
    await first.finished;
  });

  it("refuses to record an abandoned document another register already recorded", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 35,
      name: "caja-first",
    });
    const otherRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 36,
      name: "caja-second",
    });
    const request = authorizationRequestRecord(registerId, { pointOfSale: 35, number: 1 });
    await new DrizzlePointOfSaleLanes(
      postgresDedicatedConnections(sql),
      async () => {},
      async () => {},
      async () => {},
    ).inPointOfSaleLane(35, (lane) => lane.recordRequest(request));
    const { notAfter: _notAfter, receivedAt: _receivedAt, ...record } = request;

    await expect(
      unclearLanes().inPointOfSaleLane(36, (lane) =>
        lane.recordAbandonedRequest(
          { ...record, registerId: otherRegisterId, pointOfSale: 36 },
          ABANDONED_AT,
        ),
      ),
    ).rejects.toBeInstanceOf(FiscalDocumentAlreadyRecorded);
  });
});
