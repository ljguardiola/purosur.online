import { cloudErrorSchema, registerResetResponseSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, userRoles, users } from "../platform/db/schema.js";
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
});
