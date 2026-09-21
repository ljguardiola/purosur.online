import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
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
  const ENTRYPOINT = join(inject("cloudBuildDir"), "create-first-administrator.js");

  it("prints a usage error and exits 1 when required arguments are missing", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
      env: { ...process.env, DATABASE_URL: "postgres://user:pass@127.0.0.1:1/db" },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "create-first-administrator: usage: create-first-administrator --name <name> --email <email>",
    );
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
