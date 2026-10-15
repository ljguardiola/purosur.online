import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { FACTURA_C_DOCUMENT_TYPE } from "@purosur/domain";
import type { NumberingConflictLane } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, fiscalRequests, taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleNumberingConflictLanes } from "./drizzle-numbering-conflict-lanes.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";

const NOW = new Date("2026-10-06T15:05:00.000Z");
const FROZEN_AT = new Date("2026-10-06T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;
const reconciliationRequests: number[] = [];
let settled = 0;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("numbering_conflict_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  registerId = await insertRegisterWithPointOfSale(db, {
    pointOfSaleNumber: 7,
    name: "caja-1",
  });
  await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 8, name: "caja-2" });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function lanes() {
  return new DrizzleNumberingConflictLanes(
    postgresDedicatedConnections(sql),
    async (_, pointOfSale) => {
      reconciliationRequests.push(pointOfSale);
    },
    () => NOW,
  );
}

function inLane<TOutcome>(
  pointOfSale: number,
  work: (lane: NumberingConflictLane) => Promise<TOutcome>,
) {
  return lanes().inPointOfSaleLane(pointOfSale, work);
}

async function recordRequest(
  pointOfSale: number,
  number: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  const request = authorizationRequestRecord(registerId, { pointOfSale, number });
  await db.insert(fiscalRequests).values({ ...request, ...columns });
  return request.fiscalDocumentId;
}

describe("the numbering conflict lane on a real Postgres", () => {
  it("reads an unclear request with the codes it carried and no diagnosis yet", async () => {
    const fiscalDocumentId = await recordRequest(7, 500, {
      issuedOn: "2026-10-05",
      answerKind: "unclear",
      unclearCodes: [10016],
      answeredAt: FROZEN_AT,
    });

    expect(await inLane(7, (lane) => lane.numberingConflictRequest(fiscalDocumentId))).toEqual({
      pointOfSale: 7,
      number: 500,
      issuedOn: "2026-10-05",
      answer: { kind: "unclear" },
      unclearCodes: [10016],
      diagnosis: null,
    });
  });

  it("reads nothing of a request it does not hold", async () => {
    expect(
      await inLane(7, (lane) => lane.numberingConflictRequest(crypto.randomUUID())),
    ).toBeNull();
  });

  it("keeps the diagnosis of a request, with the time it was made", async () => {
    const fiscalDocumentId = await recordRequest(7, 501, {
      answerKind: "unclear",
      unclearCodes: [10016],
      answeredAt: FROZEN_AT,
    });

    await inLane(7, (lane) =>
      lane.recordNumberingDiagnosis(fiscalDocumentId, { kind: "collision" }, NOW),
    );

    expect(
      (await inLane(7, (lane) => lane.numberingConflictRequest(fiscalDocumentId)))?.diagnosis,
    ).toEqual({ kind: "collision" });
    const [row] = await sql`
      select diagnosis, diagnosed_at from fiscal_requests where fiscal_document_id = ${fiscalDocumentId}`;
    expect(row).toEqual({ diagnosis: "collision", diagnosed_at: NOW });
  });

  it("keeps a date-behind diagnosis apart from a collision", async () => {
    const fiscalDocumentId = await recordRequest(7, 502, {
      answerKind: "unclear",
      unclearCodes: [10016],
      answeredAt: FROZEN_AT,
    });

    await inLane(7, (lane) =>
      lane.recordNumberingDiagnosis(fiscalDocumentId, { kind: "date_behind" }, NOW),
    );

    expect(
      (await inLane(7, (lane) => lane.numberingConflictRequest(fiscalDocumentId)))?.diagnosis,
    ).toEqual({ kind: "date_behind" });
  });

  describe("settling the documents in a range", () => {
    const AUTHORIZED = {
      answerKind: "authorized",
      authorizationCode: "74123456789012",
      authorizationCodeDueOn: "2026-10-16",
      answeredAt: FROZEN_AT,
    };
    const UNCLEAR = { answerKind: "unclear", unclearCodes: [], answeredAt: FROZEN_AT };

    it.each([
      ["answered authorized", AUTHORIZED, "authorized"],
      ["decided adopted", { ...UNCLEAR, decision: "adopted", adoptedAuthorizationCode: "75123456789012", adoptedAuthorizationCodeDueOn: "2026-10-16", decidedAt: NOW }, "authorized"],
      ["decided conflicting", { ...UNCLEAR, decision: "conflicting", decidedAt: NOW }, "conflicting"],
      ["decided released", { ...UNCLEAR, decision: "released", decidedAt: NOW }, "released_or_rejected"],
      ["answered rejected", { answerKind: "rejected", rejectionCodes: [10015], rejectionClass: "content", answeredAt: FROZEN_AT }, "released_or_rejected"],
      ["not attempted and decided released", { answerKind: "not_attempted", answeredAt: FROZEN_AT, decision: "released", decidedAt: NOW }, "released_or_rejected"],
      ["not attempted and not decided", { answerKind: "not_attempted", answeredAt: FROZEN_AT }, "undecided"],
      ["unclear and not decided", UNCLEAR, "undecided"],
      ["not answered yet", {}, "undecided"],
    ] as const)("settles a document %s as %s", async (_case, columns, settlement) => {
      const pointOfSale = 8;
      settled += 1;
      const number = 700 + settled;
      await recordRequest(pointOfSale, number, columns);

      const documents = await inLane(pointOfSale, (lane) =>
        lane.documentsInNumberingRange({ after: number - 1, through: number }),
      );

      expect(documents).toEqual([{ number, settlement }]);
    });

    it("gives only the numbers after the first bound through the second, of its own point of sale", async () => {
      const base = 10_000_000;
      await recordRequest(7, base + 1, AUTHORIZED);
      await recordRequest(7, base + 2, AUTHORIZED);
      await recordRequest(7, base + 3, AUTHORIZED);
      await recordRequest(7, base + 4, AUTHORIZED);
      await recordRequest(8, base + 3, AUTHORIZED);

      const documents = await inLane(7, (lane) =>
        lane.documentsInNumberingRange({ after: base + 1, through: base + 3 }),
      );

      expect(documents.map(({ number }) => number)).toEqual([base + 2, base + 3]);
    });
  });

  describe("the freeze", () => {
    it("holds no freeze until one is taken", async () => {
      expect(await inLane(8, (lane) => lane.numberingFreeze())).toBeNull();
    });

    it("holds the count and the time the freeze was taken at, and only for its point of sale", async () => {
      await inLane(7, (lane) =>
        lane.freezeNumbering({ countBeforeFreeze: 12, frozenAt: FROZEN_AT }),
      );

      expect(await inLane(7, (lane) => lane.numberingFreeze())).toEqual({
        countBeforeFreeze: 12,
        frozenAt: FROZEN_AT,
      });
      expect(await inLane(8, (lane) => lane.numberingFreeze())).toBeNull();
    });

    it("lifts the freeze and only that one", async () => {
      await inLane(8, (lane) =>
        lane.freezeNumbering({ countBeforeFreeze: 3, frozenAt: FROZEN_AT }),
      );

      await inLane(7, (lane) => lane.liftNumberingFreeze());

      expect(await inLane(7, (lane) => lane.numberingFreeze())).toBeNull();
      expect(await inLane(8, (lane) => lane.numberingFreeze())).not.toBeNull();
      await inLane(8, (lane) => lane.liftNumberingFreeze());
    });

    it("logs the register's point of sale as changed when the freeze is taken and when it is lifted", async () => {
      const [{ last }] = await sql<{ last: number }[]>`select coalesce(max(change_seq), 0)::int as last from changes`;

      await inLane(7, (lane) =>
        lane.freezeNumbering({ countBeforeFreeze: 12, frozenAt: FROZEN_AT }),
      );
      await inLane(7, (lane) => lane.liftNumberingFreeze());

      const logged = await sql`
        select entity, entity_id, op from changes where change_seq > ${last} order by change_seq`;
      expect(logged).toEqual([
        { entity: "register_point_of_sale", entity_id: registerId, op: "update" },
        { entity: "register_point_of_sale", entity_id: registerId, op: "update" },
      ]);
    });

    it("asks for the reconciliation of its point of sale", async () => {
      reconciliationRequests.length = 0;

      await inLane(7, (lane) => lane.requestNumberingReconciliation());

      expect(reconciliationRequests).toEqual([7]);
    });

    it("asks for no reconciliation when the transaction that asks for it rolls back", async () => {
      reconciliationRequests.length = 0;
      const failing = new DrizzleNumberingConflictLanes(
        postgresDedicatedConnections(sql),
        async () => {
          throw new Error("the queue refused");
        },
        () => NOW,
      );

      await expect(
        failing.inPointOfSaleLane(7, (lane) => lane.requestNumberingReconciliation()),
      ).rejects.toThrow("the queue refused");
      expect(reconciliationRequests).toEqual([]);
    });
  });

  describe("the count", () => {
    it("reads zero before any count is recorded", async () => {
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(0);
    });

    it("continues the series right after the number, and never lowers a count already held", async () => {
      await inLane(8, (lane) => lane.continueNumberingAfter(20));
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(20);

      await inLane(8, (lane) => lane.continueNumberingAfter(15));
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(20);

      await inLane(8, (lane) => lane.continueNumberingAfter(25));
      expect(await inLane(8, (lane) => lane.taxAuthorityCount())).toBe(25);
      const rows = await db.select().from(taxAuthorityLastAuthorizedNumbers);
      expect(rows.filter((row) => row.pointOfSaleNumber === 8)).toEqual([
        { pointOfSaleNumber: 8, lastAuthorized: 25, readAt: NOW },
      ]);
    });

    it("logs the register's point of sale as changed when the count moves", async () => {
      const [{ last }] = await sql<{ last: number }[]>`select coalesce(max(change_seq), 0)::int as last from changes`;

      await inLane(7, (lane) => lane.continueNumberingAfter(30));

      const logged = await sql`
        select entity, entity_id from changes where change_seq > ${last} order by change_seq`;
      expect(logged).toEqual([{ entity: "register_point_of_sale", entity_id: registerId }]);
    });
  });

  describe("the external billing alert", () => {
    it("opens one alert for the number, once however many times it is asked", async () => {
      const opening = { pointOfSale: 7, documentType: FACTURA_C_DOCUMENT_TYPE, number: 31 };

      await inLane(7, (lane) => lane.openExternalBillingAlert(opening));
      await inLane(7, (lane) => lane.openExternalBillingAlert(opening));

      const opened = (await db.select().from(alerts)).filter(
        (alert) => alert.kind === "external_billing",
      );
      expect(opened).toEqual([
        expect.objectContaining({
          kind: "external_billing",
          scope: `7:${FACTURA_C_DOCUMENT_TYPE}:31`,
          detail: { pointOfSale: 7, documentType: FACTURA_C_DOCUMENT_TYPE, number: 31 },
          resolvedAt: null,
        }),
      ]);
    });

    it("opens an alert apiece for different numbers", async () => {
      await inLane(7, (lane) =>
        lane.openExternalBillingAlert({ pointOfSale: 7, documentType: FACTURA_C_DOCUMENT_TYPE, number: 32 }),
      );

      const scopes = (await db.select().from(alerts))
        .filter((alert) => alert.kind === "external_billing")
        .map((alert) => alert.scope);
      expect(scopes).toContain(`7:${FACTURA_C_DOCUMENT_TYPE}:32`);
    });
  });
});
