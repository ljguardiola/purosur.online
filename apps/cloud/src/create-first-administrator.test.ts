import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCreateFirstAdministratorArgs, UsageError } from "./create-first-administrator.js";

describe("parseCreateFirstAdministratorArgs", () => {
  it("parses --name and --email", () => {
    expect(
      parseCreateFirstAdministratorArgs(["--name", "Ada Lovelace", "--email", "ada@example.com"]),
    ).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
  });

  it("rejects a run with no arguments", () => {
    expect(() => parseCreateFirstAdministratorArgs([])).toThrow(UsageError);
  });

  it("rejects a run missing --email", () => {
    expect(() => parseCreateFirstAdministratorArgs(["--name", "Ada Lovelace"])).toThrow(UsageError);
  });

  it("rejects a run missing --name", () => {
    expect(() => parseCreateFirstAdministratorArgs(["--email", "ada@example.com"])).toThrow(
      UsageError,
    );
  });

  it("rejects an unknown option", () => {
    expect(() =>
      parseCreateFirstAdministratorArgs([
        "--name",
        "Ada Lovelace",
        "--email",
        "ada@example.com",
        "--force",
      ]),
    ).toThrow(UsageError);
  });

  it("rejects a stray positional argument", () => {
    expect(() =>
      parseCreateFirstAdministratorArgs([
        "--name",
        "Ada Lovelace",
        "--email",
        "ada@example.com",
        "extra",
      ]),
    ).toThrow(UsageError);
  });
});

describe("the create-first-administrator command", () => {
  // The command has real local imports (the use case, the schema), so it cannot run as raw
  // TypeScript the way migrate.ts's spawn test does: Node's type stripping only strips the
  // entrypoint file it is given, it does not resolve a ".js" specifier to a sibling ".ts" file.
  // Compiling once here spawns the exact artifact the package ships (`node dist/....js`).
  const CLOUD_DIR = fileURLToPath(new URL("../", import.meta.url));
  const TSC_BIN = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const ENTRYPOINT = fileURLToPath(
    new URL("../dist/create-first-administrator.js", import.meta.url),
  );

  beforeAll(() => {
    execFileSync(process.execPath, [TSC_BIN, "-p", "tsconfig.json"], { cwd: CLOUD_DIR });
  }, 30_000);

  it("prints a usage error and exits 1 when required arguments are missing", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
      env: { ...process.env, DATABASE_URL: "postgres://user:pass@127.0.0.1:1/db" },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("create-first-administrator:");
  });

  it("fails with a clear message when DATABASE_URL is not set", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;

    const result = spawnSync(
      process.execPath,
      [ENTRYPOINT, "--name", "Ada Lovelace", "--email", "ada@example.com"],
      { env, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("create-first-administrator: DATABASE_URL is not set");
  });

  it("does not print the database URL when it fails on a malformed one", () => {
    const result = spawnSync(
      process.execPath,
      [ENTRYPOINT, "--name", "Ada Lovelace", "--email", "ada@example.com"],
      {
        env: { ...process.env, DATABASE_URL: "postgres://user:s3cret-password@[bad/db" },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("s3cret-password");
  });
});
