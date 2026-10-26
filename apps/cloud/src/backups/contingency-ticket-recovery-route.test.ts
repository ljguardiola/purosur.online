import { cloudErrorSchema, contingencyTicketRecoveryAnswerSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contingencyTicketRecoveries } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerContingencyTicketRecoveryRoute } from "./contingency-ticket-recovery-route.js";
import { insertContingencyTicketRecovery } from "./test-support/contingency-ticket-recoveries.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const URL = "/devices/current/contingency-ticket-recovery";

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
  registerContingencyTicketRecoveryRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function asking(body: unknown, authorization?: string) {
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

describe("POST /devices/current/contingency-ticket-recovery", () => {
  it.each([
    ["without a device token", undefined],
    ["with a token that is not recognized", "Bearer nope.nope"],
  ])("refuses a request %s", async (_name, authorization) => {
    const response = await asking({ predecessor_device_id: crypto.randomUUID() }, authorization);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses the token of a revoked installation", async () => {
    const { predecessor } = await aRestoredRegister();

    const response = await asking(
      { predecessor_device_id: predecessor.deviceId },
      `Bearer ${predecessor.deviceToken}`,
    );

    expect(response.statusCode).toBe(401);
    expect(await db.select().from(contingencyTicketRecoveries)).toEqual([]);
  });

  it("refuses a body that is not a recovery request", async () => {
    const { current } = await aRestoredRegister();

    const response = await asking({}, `Bearer ${current.deviceToken}`);

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

    const response = await asking(
      { predecessor_device_id: other.deviceId },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("predecessor_not_of_register");
    expect(await db.select().from(contingencyTicketRecoveries)).toEqual([]);
  });

  it("answers a conflict for a predecessor that is not revoked", async () => {
    const { current } = await aRestoredRegister();

    const response = await asking(
      { predecessor_device_id: current.deviceId },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("predecessor_not_revoked");
    expect(await db.select().from(contingencyTicketRecoveries)).toEqual([]);
  });

  it("opens the recovery of the asking installation and answers that it awaits", async () => {
    const { predecessor, current } = await aRestoredRegister();

    const response = await asking(
      { predecessor_device_id: predecessor.deviceId },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    expect(contingencyTicketRecoveryAnswerSchema.parse(response.json())).toEqual({
      status: "awaiting",
    });
    expect(await db.select().from(contingencyTicketRecoveries)).toMatchObject([
      {
        registerId: current.registerId,
        restoredDeviceId: current.deviceId,
        openedAt: NOW,
        finishedAt: null,
      },
    ]);
  });

  it("opens the recovery once however many times the installation asks", async () => {
    const { predecessor, current } = await aRestoredRegister();
    const body = { predecessor_device_id: predecessor.deviceId };
    await asking(body, `Bearer ${current.deviceToken}`);

    const response = await asking(body, `Bearer ${current.deviceToken}`);

    expect(response.json()).toEqual({ status: "awaiting" });
    expect(await db.select().from(contingencyTicketRecoveries)).toHaveLength(1);
  });

  it("answers that the recovery is finished once it was finished", async () => {
    const { predecessor, current } = await aRestoredRegister();
    await insertContingencyTicketRecovery(db, {
      registerId: current.registerId,
      restoredDeviceId: current.deviceId,
      openedAt: NOW,
      finishedAt: NOW,
    });

    const response = await asking(
      { predecessor_device_id: predecessor.deviceId },
      `Bearer ${current.deviceToken}`,
    );

    expect(response.json()).toEqual({ status: "finished" });
  });
});
