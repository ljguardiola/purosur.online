import { cloudErrorSchema, healthCheckSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerHealthRoute } from "./health-route.js";

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
    authenticateDevice: (authorization) => authenticateDevice(db, authorization),
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
    const { deviceToken } = await insertEnrolledInstallation(db, revokedAt ? { revokedAt } : {});

    const response = await checkHealth(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(healthCheckSchema.parse(response.json())).toEqual({
      status: "ok",
      version: "abc1234",
      installation: { revoked },
    });
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
