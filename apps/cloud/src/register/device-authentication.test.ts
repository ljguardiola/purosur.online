import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { authenticateDevice } from "./device-authentication.js";
import { issueDeviceToken } from "./device-token.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("authenticateDevice", () => {
  it("treats a request without an Authorization header as anonymous", async () => {
    expect(await authenticateDevice(db, undefined)).toEqual({ kind: "anonymous" });
  });

  it("identifies the installation that holds the presented device token", async () => {
    const { deviceId, registerId, locationId, deviceToken } = await insertEnrolledInstallation(db);

    expect(await authenticateDevice(db, `Bearer ${deviceToken}`)).toEqual({
      kind: "installation",
      installation: { deviceId, registerId, locationId, revoked: false },
    });
  });

  it("still identifies a revoked installation by its token, telling it that it is revoked", async () => {
    const { deviceId, registerId, locationId, deviceToken } = await insertEnrolledInstallation(db, {
      revokedAt: new Date("2026-09-29T09:00:00.000Z"),
    });

    expect(await authenticateDevice(db, `Bearer ${deviceToken}`)).toEqual({
      kind: "installation",
      installation: { deviceId, registerId, locationId, revoked: true },
    });
  });

  it("reads the Bearer scheme regardless of its case", async () => {
    const { deviceId, registerId, locationId, deviceToken } = await insertEnrolledInstallation(db);

    expect(await authenticateDevice(db, `bearer ${deviceToken}`)).toEqual({
      kind: "installation",
      installation: { deviceId, registerId, locationId, revoked: false },
    });
  });

  it("rejects a token whose lookup prefix matches but whose secret does not", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    const [lookupPrefix] = deviceToken.split(".");
    const [, otherSecret] = issueDeviceToken().deviceToken.split(".");

    expect(await authenticateDevice(db, `Bearer ${lookupPrefix}.${otherSecret}`)).toEqual({
      kind: "rejected",
    });
  });

  it("rejects a well-formed token no installation holds", async () => {
    await insertEnrolledInstallation(db);

    expect(await authenticateDevice(db, `Bearer ${issueDeviceToken().deviceToken}`)).toEqual({
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
    const { deviceToken } = await insertEnrolledInstallation(db);

    expect(await authenticateDevice(db, header(deviceToken))).toEqual({ kind: "rejected" });
  });
});
