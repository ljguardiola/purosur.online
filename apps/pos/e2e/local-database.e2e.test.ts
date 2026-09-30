import { describe, expect, it, vi } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";

describe("the register's local database", () => {
  it("opens with its migrations applied when the register starts", async () => {
    const { app, logs } = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-local-database" }),
    );
    try {
      await app.firstWindow();

      await vi.waitFor(
        () => {
          expect(logs.join("")).toContain("core: the local database is ready");
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(logs.join("")).not.toContain("core: the local database could not be opened");
    } finally {
      await app.close();
    }
  });
});
