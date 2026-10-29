import { fieldChangeReaders } from "@purosur/contracts/sync/test-support/field-change-readers";
import { PULLED_ENTITIES, pullAudienceOf, STOCK_MOVEMENT_KINDS } from "@purosur/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState, tags } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { logChange } from "./change-log.js";
import { buildChangesRouteApp } from "./test-support/changes-route.js";
import {
  insertLoggedBrand,
  insertLoggedStockMovement,
  insertLoggedZoneRules,
  insertStockMovementOwners,
} from "./test-support/pull-feed-rows.js";

const NOW = new Date("2026-10-09T16:00:00.000Z");
const FIELD_READERS = fieldChangeReaders();
const A_REGISTER = {
  registerId: "register-1",
  locationId: "branch-a",
  priceListId: "price-list-a",
};

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = buildChangesRouteApp(db, { zoneRules: fixedZoneRulesSource(), now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

describe("what the cloud keeps from a register in the field", () => {
  it("has a reader for the release in the field and for the current one", () => {
    expect(FIELD_READERS.map(({ version }) => version)).toEqual(["0.0.1271", "1.0.1385"]);
  });

  it.each(FIELD_READERS.map((reader) => [reader.version, reader] as const))(
    "holds back from %s every pulled entity its reader does not know and gives it every one it does",
    (_version, reader) => {
      const audience = pullAudienceOf(A_REGISTER, reader.version);

      for (const entity of PULLED_ENTITIES) {
        const reached = audience[entity].kind !== "none";
        const readable = reader.readableEntities.includes(entity);
        expect({ entity, reached }).toEqual({ entity, reached: readable });
      }
    },
  );

  it.each(FIELD_READERS.map((reader) => [reader.version, reader] as const))(
    "holds back from %s every kind of stock movement its reader does not know and gives it every one it does",
    (_version, reader) => {
      const { stock_movement: reach } = pullAudienceOf(A_REGISTER, reader.version);
      const heldBack =
        reach.kind === "rows_of_branch_except_stock_movement_kinds" ? reach.kinds : [];

      expect([...STOCK_MOVEMENT_KINDS].filter((kind) => !heldBack.includes(kind))).toEqual(
        STOCK_MOVEMENT_KINDS.filter((kind) => reader.readableStockMovementKinds.includes(kind)),
      );
    },
  );
});

const WHAT_EACH_RELEASE_READS = {
  "0.0.1271": { brand: false, zoneRules: false, unreadableKinds: ["return", "assembly_void"] },
  "1.0.1385": { brand: true, zoneRules: true, unreadableKinds: [] },
} as const;

describe("GET /changes read by the register releases in the field", () => {
  it.each(FIELD_READERS.map((reader) => [reader.version, reader] as const))(
    "gives %s pages it reads in full, with exactly the changes it can read",
    async (version, reader) => {
      const reads = WHAT_EACH_RELEASE_READS[version as keyof typeof WHAT_EACH_RELEASE_READS];
      const { deviceId, deviceToken, locationId } = await insertEnrolledInstallation(db, {
        now: NOW,
      });
      await db.insert(deviceState).values({ deviceId, appVersion: reader.version });
      const { productId, actorId } = await insertStockMovementOwners(db, locationId);
      const brandId = await insertLoggedBrand(db, "La Serenisima");
      const zoneRulesId = await insertLoggedZoneRules(db);
      const [tag] = await db.insert(tags).values({ name: "Organico" }).returning({ id: tags.id });
      await logChange(db, { entity: "tag", entityId: tag?.id as string, version: 1, op: "insert" });
      const removedCategoryId = crypto.randomUUID();
      await logChange(db, {
        entity: "category",
        entityId: removedCategoryId,
        version: 1,
        op: "insert",
      });
      await logChange(db, {
        entity: "category",
        entityId: removedCategoryId,
        version: 2,
        op: "delete",
      });
      const movementIds = new Map<string, string>();
      for (const kind of STOCK_MOVEMENT_KINDS) {
        movementIds.set(
          await insertLoggedStockMovement(testDatabase, { kind, locationId, productId, actorId }),
          kind,
        );
      }

      const received: { entity: string; entity_id: string; row?: { kind?: string } }[] = [];
      let since = 0;
      for (let pages = 0; pages < 10; pages += 1) {
        const response = await app.inject({
          method: "GET",
          url: `/changes?since=${since}`,
          headers: { authorization: `Bearer ${deviceToken}` },
        });
        expect(response.statusCode).toBe(200);
        const page = reader.changesPage.parse(response.json()) as {
          changes: typeof received;
          cursor: number;
          has_more: boolean;
        };
        received.push(...page.changes);
        since = page.cursor;
        if (!page.has_more) {
          break;
        }
      }

      const receivedKinds = received
        .filter(({ entity }) => entity === "stock_movement")
        .map(({ row }) => row?.kind);
      expect(receivedKinds.sort()).toEqual(
        [...STOCK_MOVEMENT_KINDS]
          .filter((kind) => reader.readableStockMovementKinds.includes(kind))
          .sort(),
      );
      expect(receivedKinds.sort()).toEqual(
        [...STOCK_MOVEMENT_KINDS]
          .filter((kind) => !(reads.unreadableKinds as readonly string[]).includes(kind))
          .sort(),
      );
      expect(received.some(({ entity_id }) => entity_id === brandId)).toBe(reads.brand);
      expect(received.some(({ entity_id }) => entity_id === tag?.id)).toBe(true);
      expect(
        received.some(
          ({ entity, entity_id }) => entity === "removal" && entity_id === removedCategoryId,
        ),
      ).toBe(true);
      expect(received.some(({ entity_id }) => entity_id === zoneRulesId)).toBe(reads.zoneRules);
    },
  );
});
