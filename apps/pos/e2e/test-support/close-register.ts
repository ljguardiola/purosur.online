import type { ChildProcess } from "node:child_process";
import { WAIT_BOUND_MS } from "./bounds";
import { within } from "./until";

type ClosableApp = {
  close(): Promise<void>;
  process(): Pick<ChildProcess, "exitCode" | "signalCode" | "kill">;
};

// Playwright's close waits for the register's process to exit with no limit of its own.
export async function closeRegister(app: ClosableApp): Promise<void> {
  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const closing = app.close().then(
    () => undefined,
    (error: unknown) => ({ error }),
  );
  const outcome = await within(closing, {
    withinMs: WAIT_BOUND_MS,
    waitingFor: "the register to close",
  }).catch(() => "unbounded" as const);
  if (outcome === "unbounded") {
    child.kill();
    throw new Error(`the register did not close within ${WAIT_BOUND_MS} ms and was killed`);
  }
  if (outcome !== undefined) {
    throw outcome.error;
  }
}
