import { describe, expect, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import { CORE_READY, coreStartEnded, startEndingsIn } from "./test-support/core-start-outcomes";
import { killOnFailure } from "./test-support/kill-on-failure";
import { REGISTER_LOG_BOUND_MS, untilLogged } from "./test-support/until";

describe("the register's local database", () => {
  it("opens with its migrations applied when the register starts", async () => {
    const launched = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-local-database" }),
    );
    await killOnFailure(launched.app, async () => {
      await launched.app.firstWindow();
      await untilLogged(launched, coreStartEnded, { withinMs: REGISTER_LOG_BOUND_MS });
    });
    try {
      expect(startEndingsIn(launched.logs.join(""))).toEqual([CORE_READY]);
    } finally {
      await launched.app.close();
    }
  });
});
