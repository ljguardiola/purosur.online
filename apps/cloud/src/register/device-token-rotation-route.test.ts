import { cloudErrorSchema, deviceTokenRotationSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import {
  registerContingencyTicketKeys,
  registerInstallations,
  registerSnapshotKeys,
} from "../platform/db/schema.js";
import { registerHealthRoute } from "../platform/health-route.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { authenticateDevice } from "./device-authentication.js";
import { registerDeviceTokenRotationRoute } from "./device-token-rotation-route.js";
import { installationTokenPorts } from "./installation-token-ports.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const ENROLLMENT_TOKEN_FORMAT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/;

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
  const options = { db, rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY, now: () => NOW };
  app = Fastify();
  registerRouteAccess(app);
  registerDeviceTokenRotationRoute(app, options);
  registerHealthRoute(app, {
    version: "abc1234",
    authenticateDevice: (authorization) =>
      authenticateDevice(installationTokenPorts(options), authorization),
  });
});

afterEach(async () => {
  await app.close();
});

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function rotate(authorization?: string) {
  return app.inject({
    method: "POST",
    url: "/devices/rotate-token",
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

function checkHealth(deviceToken: string) {
  return app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: `Bearer ${deviceToken}` },
  });
}

async function rotatedToken(previousToken: string): Promise<string> {
  const response = await rotate(`Bearer ${previousToken}`);
  return deviceTokenRotationSchema.parse(response.json()).device_token;
}

describe("POST /devices/rotate-token", () => {
  it("answers a new device token shaped like an enrolled one, without a session", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await rotate(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    const rotated = deviceTokenRotationSchema.parse(response.json()).device_token;
    expect(rotated).toMatch(ENROLLMENT_TOKEN_FORMAT);
    expect(rotated).not.toBe(deviceToken);
  });

  it("hands back the installation's keys, the same on every rotation", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);

    const first = deviceTokenRotationSchema.parse((await rotate(`Bearer ${deviceToken}`)).json());
    const second = deviceTokenRotationSchema.parse(
      (await rotate(`Bearer ${first.device_token}`)).json(),
    );

    const [installation] = await db
      .select({ outboxChainKey: registerInstallations.outboxChainKey })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(first.outbox_chain_key).toBe(installation?.outboxChainKey);
    expect({ ...second, device_token: first.device_token }).toEqual(first);
  });

  it("hands back a snapshot key version and a contingency-ticket key the register got since the last rotation", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);
    const first = deviceTokenRotationSchema.parse((await rotate(`Bearer ${deviceToken}`)).json());
    const [installation] = await db
      .select({ registerId: registerInstallations.registerId })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    const registerId = installation?.registerId ?? "";
    const newSnapshotKey = { version: 2, key: Buffer.alloc(32, 2).toString("base64") };
    const newTicketKey = { version: 2, key: Buffer.alloc(32, 3).toString("base64") };
    await db.insert(registerSnapshotKeys).values({ registerId, ...newSnapshotKey });
    await db.insert(registerContingencyTicketKeys).values({ registerId, ...newTicketKey });

    const second = deviceTokenRotationSchema.parse(
      (await rotate(`Bearer ${first.device_token}`)).json(),
    );

    expect(second.snapshot_key_versions).toEqual([...first.snapshot_key_versions, newSnapshotKey]);
    expect(second.contingency_ticket_key).toEqual(newTicketKey);
    expect(second.outbox_chain_key).toBe(first.outbox_chain_key);
  });

  it("answers the same new token when retried with the previous token, keeping one pending token", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);

    const first = await rotatedToken(deviceToken);
    const retry = await rotatedToken(deviceToken);

    expect(retry).toBe(first);
    const installations = await db
      .select({ pendingPrefix: registerInstallations.pendingTokenLookupPrefix })
      .from(registerInstallations);
    expect(installations).toEqual([{ pendingPrefix: first.split(".")[0] }]);
  });

  it("refuses the previous token once the new one has been used", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    const newToken = await rotatedToken(deviceToken);

    expect((await checkHealth(deviceToken)).statusCode).toBe(200);
    expect((await checkHealth(newToken)).statusCode).toBe(200);
    const previousResponse = await checkHealth(deviceToken);

    expect(previousResponse.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(previousResponse.json())).toMatchObject({
      code: "device_token_rejected",
    });
  });

  it("rotates a token whose seven days ran out, which nothing else accepts", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { tokenIssuedAt: daysAgo(8) });

    const response = await rotate(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect((await checkHealth(deviceToken)).statusCode).toBe(401);
    const newToken = deviceTokenRotationSchema.parse(response.json()).device_token;
    expect((await checkHealth(newToken)).statusCode).toBe(200);
  });

  it("refuses the token of a revoked installation", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { revokedAt: daysAgo(1) });

    const response = await rotate(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
  });

  it.each([
    ["no Authorization header", undefined],
    ["another scheme", "Basic abcdef.ghijkl"],
    ["a token without its lookup prefix", "Bearer ghijkl"],
    ["a token no installation holds", "Bearer abcdefghijklmnop.qrstuvwxyz"],
  ])("refuses a request with %s, asking for a bearer token", async (_case, authorization) => {
    await insertEnrolledInstallation(db);

    const response = await rotate(authorization);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
  });
});
