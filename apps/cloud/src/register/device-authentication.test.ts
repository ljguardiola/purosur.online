import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { authenticateDevice } from "./device-authentication.js";
import { issueDeviceToken } from "./device-token.js";
import { installationTokenPorts } from "./installation-token-ports.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let ports: ReturnType<typeof installationTokenPorts>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  ports = installationTokenPorts({
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("authenticateDevice", () => {
  it("treats a request without an Authorization header as anonymous", async () => {
    expect(await authenticateDevice(ports, undefined)).toEqual({ kind: "anonymous" });
  });

  it("identifies the installation that holds the presented device token", async () => {
    const { deviceId, registerId, deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
    });

    expect(await authenticateDevice(ports, `Bearer ${deviceToken}`)).toEqual({
      kind: "installation",
      installation: { deviceId, registerId, revoked: false },
    });
  });

  it("still identifies a revoked installation by its token, telling it that it is revoked", async () => {
    const { deviceId, registerId, deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: new Date("2026-09-29T09:00:00.000Z"),
    });

    expect(await authenticateDevice(ports, `Bearer ${deviceToken}`)).toEqual({
      kind: "installation",
      installation: { deviceId, registerId, revoked: true },
    });
  });

  it("reads the Bearer scheme regardless of its case", async () => {
    const { deviceId, registerId, deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
    });

    expect(await authenticateDevice(ports, `bearer ${deviceToken}`)).toEqual({
      kind: "installation",
      installation: { deviceId, registerId, revoked: false },
    });
  });

  it("rejects a token whose lookup prefix matches but whose secret does not", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const [lookupPrefix] = deviceToken.split(".");
    const [, otherSecret] = issueDeviceToken().deviceToken.split(".");

    expect(await authenticateDevice(ports, `Bearer ${lookupPrefix}.${otherSecret}`)).toEqual({
      kind: "rejected",
    });
  });

  it("rejects a well-formed token no installation holds", async () => {
    await insertEnrolledInstallation(db, { now: NOW });

    expect(await authenticateDevice(ports, `Bearer ${issueDeviceToken().deviceToken}`)).toEqual({
      kind: "rejected",
    });
  });

  it.each([
    ["another scheme", (token: string) => `Basic ${token}`],
    ["the token alone", (token: string) => token],
    ["an empty token", () => "Bearer "],
    ["a token without its lookup prefix", (token: string) => `Bearer ${token.split(".")[1]}`],
    ["a token followed by something else", (token: string) => `Bearer ${token} extra`],
  ])("rejects an Authorization header with %s", async (_case, header) => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    expect(await authenticateDevice(ports, header(deviceToken))).toEqual({ kind: "rejected" });
  });
});
