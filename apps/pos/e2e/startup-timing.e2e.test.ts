import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import { WAIT_BOUND_MS } from "./test-support/bounds";
import { closeRegister } from "./test-support/close-register";
import { untilLogged } from "./test-support/until";

describe("diagnostic: a core blocked synchronously inside a startup step", () => {
  it.each([
    ["check_local_database", "1"],
    ["check_local_database", "0"],
    ["apply_migrations", "1"],
    ["apply_migrations", "0"],
  ])(
    "is reported by main at its readiness deadline while blocked at %s (without yield: %s)",
    async (step, noYield) => {
      const launched = await launchApp(
        writeChannelFile({
          channel: "staging",
          dataFolder: `purosur-pos-e2e-diag-${randomUUID()}`,
        }),
        { POS_E2E_BLOCK_AT_STEP: step, POS_E2E_NO_YIELD: noYield },
      );
      try {
        await launched.app.firstWindow();
        await untilLogged(launched, "core process: not ready within", { withinMs: WAIT_BOUND_MS });
      } finally {
        console.log(
          launched.logs
            .join("")
            .split("\n")
            .filter((line) => line.startsWith("diag:") || line.startsWith("core process:"))
            .join("\n"),
        );
        await closeRegister(launched.app);
      }
    },
    3 * WAIT_BOUND_MS,
  );
});
