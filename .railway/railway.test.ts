import type { ProjectDefinition, ServiceNode } from "railway/iac";
import { createRailwayContext, project } from "railway/iac";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import railway from "./railway";

const REQUIRED_ENV: Record<string, string> = {
  CLOUD_IMAGE_REF: "ghcr.io/ljguardiola/purosur-cloud@sha256:test",
  GHCR_PULL_TOKEN: "ghcr-pull-token",
  CLOUD_SENTRY_DSN: "https://sentry.test/1",
  BACKOFFICE_SENTRY_DSN: "https://sentry.test/2",
  RESEND_API_KEY: "resend-api-key",
  EDGE_ORIGIN_SECRET: "edge-origin-secret",
  DEVICE_TOKEN_ROTATION_KEY: "device-token-rotation-key",
  INSTALLATION_KEYS_ENCRYPTION_KEY: "installation-keys-encryption-key",
  CLOUD_APP_DATABASE_PASSWORD: "cloud-app-password",
  ARCA_CERTIFICATE: "arca-certificate-pem",
  ARCA_PRIVATE_KEY: "arca-private-key-pem",
};

beforeEach(() => {
  for (const [name, value] of Object.entries(REQUIRED_ENV)) {
    vi.stubEnv(name, value);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function compile(environment = "staging"): Promise<ProjectDefinition> {
  const ctx = createRailwayContext({ environment });
  // `railway.ts`'s own default export ignores the second argument (it uses the `project`
  // imported at its own module top level instead), but its declared type still requires one.
  return railway(ctx, project);
}

function findService(definition: ProjectDefinition, name: string): ServiceNode {
  const resources = (definition.resources ?? []).flat();
  const resource = resources.find(
    (candidate): candidate is ServiceNode =>
      candidate.type === "service" && candidate.name === name,
  );
  if (!resource) {
    throw new Error(`railway.test.ts: no service named ${name} in the compiled project`);
  }
  return resource;
}

describe("the project's resources", () => {
  it("are named for what each one is", async () => {
    const names = ((await compile()).resources ?? []).flat().map((resource) => resource.name);
    expect(names).toEqual(["Database", "Media Storage", "Schema Migrations", "Cloud Server"]);
  });
});

describe("the Cloud Server service's environment", () => {
  it("holds no reference to the database resource", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    const variables = cloud.variables ?? {};

    for (const [key, value] of Object.entries(variables)) {
      if (value.type === "reference") {
        expect(value.resource, `${key} references a resource`).not.toBe("database.Database");
      }
    }
  });

  it("embeds only the database host, port and database name in its literal values, never a credential", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    const allowedFields = ["PGHOST", "PGPORT", "PGDATABASE"];

    for (const [key, value] of Object.entries(cloud.variables ?? {})) {
      if (value.type !== "literal") {
        continue;
      }
      for (const [, field] of (value.value ?? "").matchAll(
        /\$\{\{\s*Database\.([^}\s]+)\s*\}\}/g,
      )) {
        expect(allowedFields, `${key} embeds Database.${field}`).toContain(field);
      }
    }
  });

  it("builds cloud_app's DATABASE_URL as a literal string, never a stringified reference object", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    const databaseUrl = cloud.variables?.["DATABASE_URL"];
    if (databaseUrl?.type !== "literal") {
      throw new Error("Cloud Server's DATABASE_URL is not a literal variable");
    }

    expect(databaseUrl.value).toBe(
      // A literal `${{...}}` placeholder, not JS interpolation: escaped so the string reads the
      // same as what railway.ts itself writes into the compiled config.
      `postgresql://cloud_app:cloud-app-password@\${{Database.PGHOST}}:\${{Database.PGPORT}}/\${{Database.PGDATABASE}}`,
    );
    expect(databaseUrl.value).not.toContain("[object Object]");
  });

  it("carries the ARCA certificate from the deploying environment", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    expect(cloud.variables?.["ARCA_CERTIFICATE"]).toEqual({
      type: "literal",
      value: "arca-certificate-pem",
    });
  });

  it("carries the ARCA private key from the deploying environment", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    expect(cloud.variables?.["ARCA_PRIVATE_KEY"]).toEqual({
      type: "literal",
      value: "arca-private-key-pem",
    });
  });

  it("does not compile without the ARCA private key", async () => {
    vi.stubEnv("ARCA_PRIVATE_KEY", "");

    await expect(compile()).rejects.toThrow(
      "missing required environment variable ARCA_PRIVATE_KEY",
    );
  });

  it("runs staging against ARCA's homologation environment", async () => {
    const cloud = findService(await compile("staging"), "Cloud Server");
    expect(cloud.variables?.["ARCA_ENVIRONMENT"]).toEqual({
      type: "literal",
      value: "homologation",
    });
  });

  it("refuses an environment with no ARCA environment", async () => {
    await expect(compile("preview")).rejects.toThrow("no ARCA environment configured for preview");
  });

  it("carries the device token rotation key from the deploying environment", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    expect(cloud.variables?.["DEVICE_TOKEN_ROTATION_KEY"]).toEqual({
      type: "literal",
      value: "device-token-rotation-key",
    });
  });

  it("carries the installation keys encryption key from the deploying environment", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    expect(cloud.variables?.["INSTALLATION_KEYS_ENCRYPTION_KEY"]).toEqual({
      type: "literal",
      value: "installation-keys-encryption-key",
    });
  });

  it("gives the backoffice its own Sentry DSN, apart from the cloud's", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    expect(cloud.variables?.["BACKOFFICE_SENTRY_DSN"]).toEqual({
      type: "literal",
      value: "https://sentry.test/2",
    });
    expect(cloud.variables?.["SENTRY_DSN"]).toEqual({
      type: "literal",
      value: "https://sentry.test/1",
    });
  });

  it("waits for the schema to be ready instead of applying any migration itself before deploying", async () => {
    const cloud = findService(await compile(), "Cloud Server");
    expect(cloud.deploy?.preDeployCommand).toEqual(["node dist/wait-for-ready.js"]);
  });
});

describe("the Schema Migrations service", () => {
  it("runs the schema migration once, as the admin role, and never restarts", async () => {
    const migrate = findService(await compile(), "Schema Migrations");

    expect(migrate.deploy?.startCommand).toBe("node dist/migrate.js");
    expect(migrate.deploy?.restartPolicyType).toBe("NEVER");
    expect(migrate.deploy?.healthcheckPath).toBeUndefined();
    expect(migrate.networking?.customDomains).toBeUndefined();
  });

  it("holds the database resource's admin credential", async () => {
    const migrate = findService(await compile(), "Schema Migrations");
    expect(migrate.variables?.["DATABASE_URL"]).toEqual({
      type: "reference",
      resource: "database.Database",
      output: "DATABASE_URL",
    });
  });
});
