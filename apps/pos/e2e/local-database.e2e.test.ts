import { describe, expect, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import { untilLogged } from "./test-support/until";

describe("the register's local database", () => {
  it("opens with its migrations applied when the register starts", async () => {
    const launched = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-local-database" }),
    );
    try {
      await launched.app.firstWindow();

      await untilLogged(
        launched,
        (output) =>
          output.includes("core: the local database is ready") ||
          output.includes("core: the local database could not be opened"),
      );
      const output = launched.logs.join("");
      expect(output).toContain("core: the local database is ready");
      expect(output).not.toContain("core: the local database could not be opened");
    } finally {
      await launched.app.close();
    }
  });
});
