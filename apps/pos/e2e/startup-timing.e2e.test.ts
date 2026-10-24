import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import { WAIT_BOUND_MS } from "./test-support/bounds";
import { closeRegister } from "./test-support/close-register";
import { coreStartEnded } from "./test-support/core-start-outcomes";
import { untilLogged } from "./test-support/until";

const LAUNCHES = 20;

describe("diagnostic: the core's startup timings on a fresh database", () => {
  it(
    "logs each launch's startup steps",
    async () => {
      const failures: string[] = [];
      for (let launch = 1; launch <= LAUNCHES; launch += 1) {
        const launched = await launchApp(
          writeChannelFile({
            channel: "staging",
            dataFolder: `purosur-pos-e2e-diag-${randomUUID()}`,
          }),
          { POS_E2E_STARTUP_DIAG: "1" },
        );
        const startedAt = performance.now();
        try {
          await launched.app.firstWindow();
          await untilLogged(launched, coreStartEnded, { withinMs: WAIT_BOUND_MS });
          await untilLogged(launched, (output) => output.includes("diag: one_transaction"), {
            withinMs: WAIT_BOUND_MS,
          });
        } catch (error) {
          failures.push(`launch ${launch}: ${String(error)}`);
        } finally {
          const diagnostics = launched.logs
            .join("")
            .split("\n")
            .filter((line) => line.startsWith("diag:") || line.startsWith("core process:"));
          console.log(
            `launch ${launch} (${Math.round(performance.now() - startedAt)} ms):\n${diagnostics.join("\n")}`,
          );
          await closeRegister(launched.app);
        }
      }
      console.log(failures.length === 0 ? "every launch started" : failures.join("\n"));
    },
    LAUNCHES * 3 * WAIT_BOUND_MS,
  );
});
