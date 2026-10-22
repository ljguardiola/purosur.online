import { cloudErrorSchema, registerResetResponseSchema } from "@purosur/contracts";
import { desc } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ANSWERED_AT,
  anAuthorizedAnswer,
  aRejectedAnswer,
  insertSaleVoidCreditNote,
  REQUESTED_AT,
} from "../fiscal/test-support/sale-void-credit-notes.js";
import { inbox, roles, userRoles, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerDeviceResetRoute } from "./device-reset-route.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const URL = "/devices/current/reset";

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
  app = Fastify();
  registerRouteAccess(app);
  registerDeviceResetRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function reset(body: unknown, authorization?: string) {
  return app.inject({
    method: "POST",
    url: URL,
    ...(authorization !== undefined && { headers: { authorization } }),
    payload: body as Record<string, unknown>,
  });
}

async function aRestoredRegister() {
  const predecessor = await insertEnrolledInstallation(db, {
    now: NOW,
    revokedAt: new Date("2026-10-19T12:00:00.000Z"),
  });
  const current = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: predecessor.registerId,
  });
  return { predecessor, current };
}

describe("POST /devices/current/reset", () => {
  it.each([
    ["without a device token", undefined],
    ["with a token that is not recognized", "Bearer nope.nope"],
  ])("refuses a request %s", async (_name, authorization) => {
    const response = await reset(
      { predecessor_device_id: crypto.randomUUID(), last_acknowledged_seq: 0 },
      authorization,
    );

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses the token of a revoked installation", async () => {
    const { predecessor } = await aRestoredRegister();

    const response = await reset(
      { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${predecessor.deviceToken}`,
    );

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a body that is not a reset request", async () => {
    const { current } = await aRestoredRegister();

    const response = await reset({ last_acknowledged_seq: 0 }, `Bearer ${current.deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
  });

  it("answers a conflict for a predecessor that belongs to another register", async () => {
    const { current } = await aRestoredRegister();
    const other = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: new Date("2026-10-19T12:00:00.000Z"),
      registerName: "Caja 2",
    });

    const response = await reset(
      { predecessor_device_id: other.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("predecessor_not_of_register");
  });

  it("answers a conflict for a predecessor that is not revoked", async () => {
    const { current } = await aRestoredRegister();

    const response = await reset(
      { predecessor_device_id: current.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("predecessor_not_revoked");
  });

  it("answers a conflict for a cursor that names an installation outside the replenishment", async () => {
    const { predecessor, current } = await aRestoredRegister();
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });

    const response = await reset(
      {
        predecessor_device_id: predecessor.deviceId,
        last_acknowledged_seq: 0,
        after: { device_id: other.deviceId, device_seq: 1 },
      },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("cursor_not_of_replenishment");
  });

  it("answers the events above the position and the branch's users", async () => {
    const { predecessor, current } = await aRestoredRegister();
    await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 1 });
    const eventId = await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 2 });
    const [user] = await db
      .insert(users)
      .values({ firstName: "Ana", email: "ana@example.com", locationId: current.locationId })
      .returning({ id: users.id });
    const [role] = await db.select({ id: roles.id }).from(roles).limit(1);
    if (!user || !role) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

    const response = await reset(
      { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 1 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    const body = registerResetResponseSchema.parse(response.json());
    expect(body.events.map(({ event_id }) => event_id)).toEqual([eventId]);
    expect(body.events.map(({ device_id }) => device_id)).toEqual([predecessor.deviceId]);
    expect(body.next).toBeNull();
    expect(body.users).toEqual([
      {
        user_id: user.id,
        first_name: "Ana",
        role_id: role.id,
        salt: null,
        pin_hash: null,
        active: true,
        version: 1,
      },
    ]);
  });

  it("continues after the event the cursor names", async () => {
    const { predecessor, current } = await aRestoredRegister();
    await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 1 });
    await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 2 });
    const third = await insertInboxEvent(db, predecessor.deviceId, { deviceSeq: 3 });

    const response = await reset(
      {
        predecessor_device_id: predecessor.deviceId,
        last_acknowledged_seq: 0,
        after: { device_id: predecessor.deviceId, device_seq: 2 },
      },
      `Bearer ${current.deviceToken}`,
    );

    const body = registerResetResponseSchema.parse(response.json());
    expect(body.events.map(({ event_id }) => event_id)).toEqual([third]);
  });

  it("answers the deferred-sale records of the token's own register, never those of another register", async () => {
    const { predecessor, current } = await aRestoredRegister();
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const ownRecord = await insertInboxEvent(db, predecessor.deviceId, {
      eventType: "deferred_sale_recorded",
      schemaVersion: 1,
    });
    await insertInboxEvent(db, other.deviceId, {
      eventType: "deferred_sale_recorded",
      schemaVersion: 1,
    });

    const response = await reset(
      { predecessor_device_id: predecessor.deviceId, last_acknowledged_seq: 0 },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    const { events } = registerResetResponseSchema.parse(response.json());
    expect(events.map(({ event_id }) => event_id)).toEqual([ownRecord]);
  });

  describe("the credit note answers", () => {
    async function aVoidedSale(deviceId: string) {
      const saleId = crypto.randomUUID();
      await insertInboxEvent(db, deviceId, {
        eventType: "sale_voided",
        schemaVersion: 3,
        aggregateId: saleId,
      });
      return saleId;
    }

    function resetOf(
      predecessor: { deviceId: string },
      current: { deviceToken: string },
      after?: { device_id: string; device_seq: number },
    ) {
      return reset(
        {
          predecessor_device_id: predecessor.deviceId,
          last_acknowledged_seq: 0,
          ...(after && { after }),
        },
        `Bearer ${current.deviceToken}`,
      );
    }

    it("answers what the tax authority said about the credit notes of the register's voided sales", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const authorizedSale = await aVoidedSale(predecessor.deviceId);
      const rejectedSale = await aVoidedSale(predecessor.deviceId);
      const authorizedId = await insertSaleVoidCreditNote(
        db,
        current.registerId,
        authorizedSale,
        anAuthorizedAnswer(9),
      );
      const rejectedId = await insertSaleVoidCreditNote(
        db,
        current.registerId,
        rejectedSale,
        aRejectedAnswer(),
      );

      const response = await resetOf(predecessor, current);

      expect(response.statusCode).toBe(200);
      const { credit_notes } = registerResetResponseSchema.parse(response.json());
      expect(credit_notes).toHaveLength(2);
      expect(credit_notes).toEqual(
        expect.arrayContaining([
          {
            credit_note_id: authorizedId,
            answered_at: ANSWERED_AT.toISOString(),
            state: "AUTHORIZED",
            point_of_sale: 7,
            number: 9,
            issued_on: "2026-10-07",
            issued_at: REQUESTED_AT.toISOString(),
            authorization_code: "74123456789012",
            authorization_code_due_on: "2026-10-17",
          },
          {
            credit_note_id: rejectedId,
            answered_at: ANSWERED_AT.toISOString(),
            state: "REJECTED",
          },
        ]),
      );
    });

    it("never answers the credit note another register holds for a sale of this one", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
      const saleId = await aVoidedSale(predecessor.deviceId);
      await insertSaleVoidCreditNote(db, other.registerId, saleId, anAuthorizedAnswer());

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).credit_notes).toEqual([]);
    });

    it("leaves out the credit note of a sale the page's events do not void", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const completedSale = crypto.randomUUID();
      await insertInboxEvent(db, predecessor.deviceId, { aggregateId: completedSale });
      await insertSaleVoidCreditNote(db, current.registerId, completedSale, anAuthorizedAnswer());

      const response = await resetOf(predecessor, current);

      expect(registerResetResponseSchema.parse(response.json()).credit_notes).toEqual([]);
    });

    it("answers each credit note with the page that holds its voided sale, exactly once across the pages", async () => {
      const { predecessor, current } = await aRestoredRegister();
      const firstSale = await aVoidedSale(predecessor.deviceId);
      for (let filler = 0; filler < 199; filler += 1) {
        await insertInboxEvent(db, predecessor.deviceId);
      }
      const lastOfFirstPage = await db
        .select({ deviceSeq: inbox.deviceSeq })
        .from(inbox)
        .orderBy(desc(inbox.deviceSeq))
        .limit(1);
      const secondSale = await aVoidedSale(predecessor.deviceId);
      const firstCreditNote = await insertSaleVoidCreditNote(
        db,
        current.registerId,
        firstSale,
        anAuthorizedAnswer(),
      );
      const secondCreditNote = await insertSaleVoidCreditNote(
        db,
        current.registerId,
        secondSale,
        anAuthorizedAnswer(),
      );

      const first = registerResetResponseSchema.parse((await resetOf(predecessor, current)).json());
      const second = registerResetResponseSchema.parse(
        (
          await resetOf(predecessor, current, {
            device_id: predecessor.deviceId,
            device_seq: lastOfFirstPage[0]?.deviceSeq ?? 0,
          })
        ).json(),
      );

      expect(first.next).not.toBeNull();
      expect(first.credit_notes.map(({ credit_note_id }) => credit_note_id)).toEqual([
        firstCreditNote,
      ]);
      expect(second.credit_notes.map(({ credit_note_id }) => credit_note_id)).toEqual([
        secondCreditNote,
      ]);
    });
  });
});
