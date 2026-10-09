import {
  type AuthorizeFiscalDocumentPorts,
  authorizeFiscalDocument,
  type FiscalDocumentSolicitation,
  type SolicitationAnswer,
  type TaxAuthorityInvoicing,
} from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { arcaInvoicingEvidence } from "../platform/db/schema.js";
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
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("point_of_sale_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
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
    await vi.waitFor(() => expect(this.started.length).toBeGreaterThanOrEqual(count));
  }
}

function portsOf(taxAuthority: TaxAuthorityInvoicing): AuthorizeFiscalDocumentPorts {
  return {
    lanes: new DrizzlePointOfSaleLanes(postgresDedicatedConnections(sql)),
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

function answerKindsAt(pointOfSale: number) {
  return sql<{ number: number; answer_kind: string | null }[]>`
    select number, answer_kind from fiscal_requests where point_of_sale = ${pointOfSale}`;
}

async function invoicingEvidenceTimes(): Promise<Date[]> {
  const rows = await db.select().from(arcaInvoicingEvidence);
  return rows.map((row) => row.lastCallOkAt);
}

describe("the point of sale lanes on a real Postgres", () => {
  it("keeps the request committed and visible to other connections while the call is in flight, and records the answer and the evidence after it", async () => {
    await sql`delete from arca_invoicing_evidence`;
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 11,
      name: "caja-visible",
    });
    const taxAuthority = new HeldTaxAuthority();

    const outcome = authorize(portsOf(taxAuthority), registerId, 11, 100);
    await taxAuthority.untilStarted(1);

    expect(await answerKindsAt(11)).toEqual([{ number: 100, answer_kind: null }]);
    expect(await invoicingEvidenceTimes()).toEqual([]);

    taxAuthority.release(100);
    await outcome;
    expect(await answerKindsAt(11)).toEqual([{ number: 100, answer_kind: "authorized" }]);
    expect(await invoicingEvidenceTimes()).toEqual([RECEIVED_AT]);
  });

  it("leaves the request without an answer and records no evidence when the call breaks", async () => {
    await sql`delete from arca_invoicing_evidence`;
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 16,
      name: "caja-call-broken",
    });
    const taxAuthority = new HeldTaxAuthority();

    const outcome = authorize(portsOf(taxAuthority), registerId, 16, 500);
    await taxAuthority.untilStarted(1);
    taxAuthority.release(500, new Error("the connection broke"));

    await expect(outcome).rejects.toThrow("the connection broke");
    expect(await answerKindsAt(16)).toEqual([{ number: 500, answer_kind: null }]);
    expect(await invoicingEvidenceTimes()).toEqual([]);
  });

  it("leaves the request without an answer and records no evidence when recording the answer fails", async () => {
    await sql`delete from arca_invoicing_evidence`;
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 17,
      name: "caja-answer-broken",
    });
    const taxAuthority = new HeldTaxAuthority();
    await admin`
      create function refuse_invoicing_evidence() returns trigger language plpgsql as $$
      begin
        raise exception 'the evidence write broke';
      end;
      $$`;
    await admin`
      create trigger refuse_invoicing_evidence before insert on arca_invoicing_evidence
      for each row execute function refuse_invoicing_evidence()`;

    try {
      const outcome = authorize(portsOf(taxAuthority), registerId, 17, 600);
      await taxAuthority.untilStarted(1);
      taxAuthority.release(600);

      await expect(outcome).rejects.toMatchObject({
        cause: { message: "the evidence write broke" },
      });
    } finally {
      await admin`drop trigger refuse_invoicing_evidence on arca_invoicing_evidence`;
      await admin`drop function refuse_invoicing_evidence()`;
    }
    expect(await answerKindsAt(17)).toEqual([{ number: 600, answer_kind: null }]);
    expect(await invoicingEvidenceTimes()).toEqual([]);
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
