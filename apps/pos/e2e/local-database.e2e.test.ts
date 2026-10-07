import { describe, expect, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import {
  CORE_READY,
  loggedAStartOutcome,
  startOutcomesIn,
} from "./test-support/core-start-outcomes";
import { untilLogged } from "./test-support/until";

describe("the register's local database", () => {
  it("opens with its migrations applied when the register starts", async () => {
    const launched = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-local-database" }),
    );
    try {
      await launched.app.firstWindow();

      await untilLogged(launched, loggedAStartOutcome);
      expect(startOutcomesIn(launched.logs.join(""))).toEqual([CORE_READY]);
    } finally {
      await launched.app.close();
    }
  });
});
