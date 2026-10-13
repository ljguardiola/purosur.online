import type { ChildProcess } from "node:child_process";

const RECHECK_INTERVAL_MS = 100;

// A register logs each awaited line within about a second on CI; the bound is far above that and only
// turns one that never logs into a failure showing what it did log, instead of a silent job timeout.
export const REGISTER_LOG_BOUND_MS = 60_000;

type LoggingApp = {
  process(): Pick<ChildProcess, "exitCode" | "signalCode"> & {
    once(event: "close", listener: () => void): unknown;
    off(event: "close", listener: () => void): unknown;
  };
};

// No limit on purpose: a condition that never holds is ended by the job's own timeout, and a limit
// here would only turn a slow machine into a failure.
export async function until(holds: () => boolean | Promise<boolean>): Promise<void> {
  while (true) {
    if (await holds()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, RECHECK_INTERVAL_MS));
  }
}

export async function untilLogged(
  { app, logs }: { readonly app: LoggingApp; readonly logs: readonly string[] },
  expected: string | ((output: string) => boolean),
  { withinMs }: { readonly withinMs: number },
): Promise<void> {
  const matches =
    typeof expected === "string" ? (output: string) => output.includes(expected) : expected;
  const awaited = typeof expected === "string" ? `"${expected}"` : "what was expected";
  const child = app.process();
  let exited = child.exitCode !== null || child.signalCode !== null;
  let expired = false;
  const markExited = (): void => {
    exited = true;
  };
  child.once("close", markExited);
  const bound = setTimeout(() => {
    expired = true;
  }, withinMs);
  try {
    while (true) {
      if (matches(logs.join(""))) {
        return;
      }
      if (exited) {
        throw new Error(
          `the register's process exited before it logged ${awaited}; it logged:\n${logs.join("")}`,
        );
      }
      if (expired) {
        throw new Error(
          `the register did not log ${awaited} within ${withinMs} ms; it logged:\n${logs.join("")}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, RECHECK_INTERVAL_MS));
    }
  } finally {
    clearTimeout(bound);
    child.off("close", markExited);
  }
}
