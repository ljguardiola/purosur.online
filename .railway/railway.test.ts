import type { ProjectDefinition, ServiceNode } from "railway/iac";
import { createRailwayContext, project } from "railway/iac";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import railway from "./railway";

const REQUIRED_ENV: Record<string, string> = {
  CLOUD_IMAGE_REF: "ghcr.io/ljguardiola/purosur-cloud@sha256:test",
  GHCR_PULL_TOKEN: "ghcr-pull-token",
  CLOUD_SENTRY_DSN: "https://sentry.test/1",
  RESEND_API_KEY: "resend-api-key",
  EDGE_ORIGIN_SECRET: "edge-origin-secret",
  CLOUD_APP_DATABASE_PASSWORD: "cloud-app-password",
};

beforeEach(() => {
  for (const [name, value] of Object.entries(REQUIRED_ENV)) {
    vi.stubEnv(name, value);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function compile(): Promise<ProjectDefinition> {
  const ctx = createRailwayContext({ environment: "staging" });
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
    const databaseUrl = cloud.variables?.DATABASE_URL;
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
    expect(migrate.variables?.DATABASE_URL).toEqual({
      type: "reference",
      resource: "database.Database",
      output: "DATABASE_URL",
    });
  });
});
