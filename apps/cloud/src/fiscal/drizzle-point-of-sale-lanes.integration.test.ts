import {
  type AuthorizeFiscalDocumentPorts,
  authorizeFiscalDocument,
  type FiscalDocumentSolicitation,
  type SolicitationAnswer,
  type TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzlePointOfSaleLanes } from "./drizzle-point-of-sale-lanes.js";
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

const AUTHORIZED: SolicitationAnswer = {
  kind: "authorized",
  authorizationCode: "74123456789012",
  authorizationCodeDueOn: "2026-10-16",
};

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("point_of_sale_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

class HeldTaxAuthority implements TaxAuthorityInvoicing {
  readonly started: number[] = [];
  readonly finished: number[] = [];
  private readonly releases = new Map<number, (answer: SolicitationAnswer | Error) => void>();

  solicit({ number }: FiscalDocumentSolicitation): Promise<SolicitationAnswer> {
    this.started.push(number);
    return new Promise((resolve, reject) => {
      this.releases.set(number, (outcome) => {
        this.finished.push(number);
        if (outcome instanceof Error) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      });
    });
  }

  release(number: number, outcome: SolicitationAnswer | Error = AUTHORIZED): void {
    this.releases.get(number)?.(outcome);
  }

  async untilStarted(count: number): Promise<void> {
    while (this.started.length < count) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

function portsOf(taxAuthority: TaxAuthorityInvoicing): AuthorizeFiscalDocumentPorts {
  return {
    lanes: new DrizzlePointOfSaleLanes(postgresDedicatedConnections(sql)),
    clock: { now: () => RECEIVED_AT },
    tokens: { validToken: async () => TOKEN },
    taxAuthority,
    evidence: { recordInvoicingCallOk: async () => {} },
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

describe("the point of sale lanes on a real Postgres", () => {
  it("keeps the request committed and visible to other connections while the call is in flight", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 11,
      name: "caja-visible",
    });
    const taxAuthority = new HeldTaxAuthority();

    const outcome = authorize(portsOf(taxAuthority), registerId, 11, 100);
    await taxAuthority.untilStarted(1);

    const rows = await sql<{ number: number; answer_kind: string | null }[]>`
      select number, answer_kind from fiscal_requests where point_of_sale = 11`;
    expect(rows).toEqual([{ number: 100, answer_kind: null }]);

    taxAuthority.release(100);
    await outcome;
    const answered = await sql<{ answer_kind: string | null }[]>`
      select answer_kind from fiscal_requests where point_of_sale = 11`;
    expect(answered).toEqual([{ answer_kind: "authorized" }]);
  });

  it("starts no second call at a point of sale while one is in flight, and starts it once the first ends", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 12,
      name: "caja-serial",
    });
    const taxAuthority = new HeldTaxAuthority();
    const ports = portsOf(taxAuthority);

    const first = authorize(ports, registerId, 12, 200);
    await taxAuthority.untilStarted(1);
    const second = authorize(ports, registerId, 12, 201);
    await waitForLockWaiters(sql, 1);

    expect(taxAuthority.started).toEqual([200]);

    taxAuthority.release(200);
    await first;
    await taxAuthority.untilStarted(2);
    expect(taxAuthority.finished).toEqual([200]);
    taxAuthority.release(201);
    await second;
    expect(taxAuthority.started).toEqual([200, 201]);
  });

  it("lets calls at different points of sale be in flight together", async () => {
    const firstRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 13,
      name: "caja-a",
    });
    const secondRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 14,
      name: "caja-b",
    });
    const taxAuthority = new HeldTaxAuthority();
    const ports = portsOf(taxAuthority);

    const first = authorize(ports, firstRegisterId, 13, 300);
    const second = authorize(ports, secondRegisterId, 14, 301);
    await taxAuthority.untilStarted(2);

    expect(taxAuthority.finished).toEqual([]);

    taxAuthority.release(300);
    taxAuthority.release(301);
    await Promise.all([first, second]);
  });

  it("frees the point of sale when the call breaks, so the next request is served", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 15,
      name: "caja-broken",
    });
    const taxAuthority = new HeldTaxAuthority();
    const ports = portsOf(taxAuthority);

    const broken = authorize(ports, registerId, 15, 400);
    await taxAuthority.untilStarted(1);
    const next = authorize(ports, registerId, 15, 401);
    await waitForLockWaiters(sql, 1);
    taxAuthority.release(400, new Error("the connection broke"));
    await expect(broken).rejects.toThrow("the connection broke");

    await taxAuthority.untilStarted(2);
    taxAuthority.release(401);
    await expect(next).resolves.toMatchObject({ kind: "answered" });
  });
});
