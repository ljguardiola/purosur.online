import { cloudErrorSchema, registerUpdateAnswerSchema } from "@purosur/contracts";
import type { RegisterRelease, RegisterReleases } from "@purosur/domain/register/use-cases";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { buildRegisterUpdateRouteApp } from "./test-support/register-update-route.js";

const NOW = new Date("2026-10-12T09:30:00.000Z");
const RELEASE: RegisterRelease = {
  version: { major: 1, minor: 4, patch: 2 },
  file: "Puro Sur Setup 1.4.2.exe",
  size: 98765432,
  sha512: `${"A".repeat(85)}A==`,
};
const DOWNLOAD_URL = "https://downloads.example.test/register-updates/1.4.2/setup.exe?sig=1";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let reported: unknown[];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  reported = [];
});

afterEach(async () => {
  await app.close();
});

function feedPublishing(release: RegisterRelease | undefined): {
  releases: RegisterReleases;
  downloadUrl: (release: RegisterRelease) => Promise<string>;
} {
  return {
    releases: { latest: async () => release },
    downloadUrl: async () => DOWNLOAD_URL,
  };
}

function build(feed?: ReturnType<typeof feedPublishing>) {
  app = buildRegisterUpdateRouteApp(db, {
    now: () => NOW,
    reportError: (error) => reported.push(error),
    ...(feed && { feed }),
  });
}

function ask(query: string, authorization?: string) {
  return app.inject({
    method: "GET",
    url: `/register/update${query}`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

describe("GET /register/update", () => {
  it("answers an unauthenticated request with device_token_rejected", async () => {
    build(feedPublishing(RELEASE));

    const response = await ask("?installed_version=1.0.0");

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers an unknown device token with device_token_rejected", async () => {
    build(feedPublishing(RELEASE));

    const response = await ask("?installed_version=1.0.0", "Bearer not-a-known-token");

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers a revoked installation with device_token_rejected", async () => {
    build(feedPublishing(RELEASE));
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW, revokedAt: NOW });

    const response = await ask("?installed_version=1.0.0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses the credentials before reading the feed", async () => {
    let reads = 0;
    build({
      releases: {
        latest: async () => {
          reads += 1;
          return RELEASE;
        },
      },
      downloadUrl: async () => DOWNLOAD_URL,
    });

    await ask("?installed_version=1.0.0");

    expect(reads).toBe(0);
  });

  it.each(["", "?installed_version=latest", "?installed_version=1.0.0&channel=beta"])(
    "answers the query %j with validation_failed",
    async (query) => {
      build(feedPublishing(RELEASE));
      const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

      const response = await ask(query, `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(400);
      expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
    },
  );

  it("answers up_to_date when the installed version is the published one", async () => {
    build(feedPublishing(RELEASE));
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await ask("?installed_version=1.4.2", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(registerUpdateAnswerSchema.parse(response.json())).toEqual({ status: "up_to_date" });
  });

  it("answers up_to_date when nothing is published", async () => {
    build(feedPublishing(undefined));
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await ask("?installed_version=1.0.0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "up_to_date" });
  });

  it("offers the published release with its presigned download URL", async () => {
    build(feedPublishing(RELEASE));
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await ask("?installed_version=1.0.0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "available",
      version: "1.4.2",
      size: RELEASE.size,
      sha512: RELEASE.sha512,
      download_url: DOWNLOAD_URL,
    });
  });

  it("answers update_feed_unavailable when no feed is configured", async () => {
    build();
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await ask("?installed_version=1.0.0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(503);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("update_feed_unavailable");
  });

  it("answers update_feed_unavailable and reports the failure when the feed fails", async () => {
    const failure = new Error("bucket unreachable");
    build({
      releases: {
        latest: async () => {
          throw failure;
        },
      },
      downloadUrl: async () => DOWNLOAD_URL,
    });
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await ask("?installed_version=1.0.0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(503);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("update_feed_unavailable");
    expect(reported).toEqual([failure]);
  });
});
