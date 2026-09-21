import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  it("rejects when the database is unreachable", async () => {
    await expect(
      runMigrations("postgres://user:pass@127.0.0.1:1/nonexistent", {
        migrationsFolder: new URL("../migrations", import.meta.url).pathname,
        connectTimeoutSeconds: 1,
      }),
    ).rejects.toThrow();
  });
});
