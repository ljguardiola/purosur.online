import { cloudErrorSchema, healthCheckSchema } from "@purosur/contracts";
import { admitInstallationRequest } from "@purosur/domain/sync/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaOnlineStatusOf } from "../fiscal/arca-online-status.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { issueDeviceToken } from "../register/device-token.js";
import { installationTokenPorts } from "../register/installation-token-ports.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { DrizzleRequestAdmission } from "../sync/drizzle-request-admission.js";
import { insertRequestsUpToLimit } from "../sync/test-support/admitted-requests.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { arcaVitalityChecks, arcaWsaaTokens } from "./db/schema.js";
import { registerHealthRoute } from "./health-route.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const CERTIFICATE_FINGERPRINT = "AA:BB:CC";

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
  registerHealthRoute(app, {
    version: "abc1234",
    arcaOnlineStatus: arcaOnlineStatusOf(db, {
      certificateFingerprint: CERTIFICATE_FINGERPRINT,
      now: () => NOW,
    }),
    authenticateDevice: (authorization) =>
      authenticateDevice(
        installationTokenPorts({
          db,
          rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
          keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
          now: () => NOW,
        }),
        authorization,
      ),
    admitRequest: (deviceId) =>
      admitInstallationRequest(
        { admission: new DrizzleRequestAdmission(db), clock: { now: () => NOW } },
        { deviceId, endpoint: "health_check" },
      ),
  });
});

afterEach(async () => {
  await app.close();
});

function checkHealth(authorization?: string) {
  return app.inject({
    method: "GET",
    url: "/health",
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

describe("GET /health", () => {
  it("answers a caller that presents no device token without telling it about any installation", async () => {
    const response = await checkHealth();

    expect(response.statusCode).toBe(200);
    expect(healthCheckSchema.parse(response.json())).toEqual({ status: "ok", version: "abc1234" });
  });

  it.each([
    ["an active installation that it is not revoked", undefined, false],
    ["a revoked installation that it is revoked", new Date("2026-09-29T09:00:00.000Z"), true],
  ])("tells %s", async (_case, revokedAt, revoked) => {
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      ...(revokedAt && { revokedAt }),
    });

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(healthCheckSchema.parse(response.json())).toEqual({
      status: "ok",
      version: "abc1234",
      installation: { revoked },
      arca: { token_valid: false, probe_ok_at: null, reachable: false },
    });
  });

  it("does not read the state of ARCA for a caller that presents no device token", async () => {
    const failing = Fastify();
    registerRouteAccess(failing);
    registerHealthRoute(failing, {
      version: "abc1234",
      arcaOnlineStatus: () => Promise.reject(new Error("must not be read")),
    });

    const response = await failing.inject({ method: "GET", url: "/health" });
    await failing.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
  });

  it("tells an installation ARCA is reachable from a recent successful probe", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const probeOkAt = new Date(NOW.getTime() - 30_000);
    await db.insert(arcaVitalityChecks).values({ checkedAt: probeOkAt, ok: true });

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(healthCheckSchema.parse(response.json()).arca).toMatchObject({
      probe_ok_at: probeOkAt.toISOString(),
      reachable: true,
    });
  });

  it("tells an installation no probe succeeded yet when only failed checks exist", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(arcaVitalityChecks).values({ checkedAt: NOW, ok: false });

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(healthCheckSchema.parse(response.json()).arca).toMatchObject({
      probe_ok_at: null,
      reachable: false,
    });
  });

  it.each([
    ["valid until after now", 3_600_000, true],
    ["expired", -60_000, false],
  ])("tells an installation its WSAA token is %s", async (_case, expiresInMs, tokenValid) => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(arcaWsaaTokens).values({
      service: "wsfe",
      certificateFingerprint: CERTIFICATE_FINGERPRINT,
      token: "t",
      sign: "s",
      issuedAt: new Date(NOW.getTime() - 3_600_000),
      expiresAt: new Date(NOW.getTime() + expiresInMs),
    });

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(healthCheckSchema.parse(response.json()).arca).toMatchObject({
      token_valid: tokenValid,
    });
  });

  it("does not take another certificate's token for a valid one", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(arcaWsaaTokens).values({
      service: "wsfe",
      certificateFingerprint: "DD:EE:FF",
      token: "t",
      sign: "s",
      issuedAt: new Date(NOW.getTime() - 3_600_000),
      expiresAt: new Date(NOW.getTime() + 3_600_000),
    });

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(healthCheckSchema.parse(response.json()).arca).toMatchObject({ token_valid: false });
  });

  it("refuses an installation's check past its limit with when to retry", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await insertRequestsUpToLimit(
      db,
      deviceId,
      "health_check",
      new Date(NOW.getTime() - 59 * 60 * 1000),
    );

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(cloudErrorSchema.parse(response.json())).toEqual({
      code: "rate_limited",
      message: "too many requests",
      details: [{ retry_after_seconds: 60 }],
    });
  });

  it("never limits a caller that presents no device token", async () => {
    const responses = await Promise.all([checkHealth(), checkHealth(), checkHealth()]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
  });

  it("refuses a device token no installation holds with the cloud error envelope", async () => {
    const response = await checkHealth(`Bearer ${issueDeviceToken().deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
  });

  it("answers a failure to identify the installation with the cloud error envelope, revealing nothing of it", async () => {
    const failing = Fastify();
    registerRouteAccess(failing);
    registerHealthRoute(failing, {
      version: "abc1234",
      authenticateDevice: () =>
        Promise.reject(new Error("Failed query: select register_installations")),
    });

    const response = await failing.inject({
      method: "GET",
      url: "/health",
      headers: { authorization: `Bearer ${issueDeviceToken().deviceToken}` },
    });
    await failing.close();

    expect(response.statusCode).toBe(500);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "internal_error" });
    expect(response.body).not.toContain("register_installations");
  });

  it("answers without any installation when no device authentication is wired", async () => {
    const bare = Fastify();
    registerRouteAccess(bare);
    registerHealthRoute(bare, { version: "abc1234" });

    const response = await bare.inject({
      method: "GET",
      url: "/health",
      headers: { authorization: `Bearer ${issueDeviceToken().deviceToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "abc1234" });
    await bare.close();
  });
});
