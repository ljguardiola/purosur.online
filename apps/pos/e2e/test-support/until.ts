import type { LaunchedApp } from "../launch-app";

const RECHECK_INTERVAL_MS = 100;

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
  { app, logs }: { readonly app: LaunchedApp["app"]; readonly logs: readonly string[] },
  expected: string | ((output: string) => boolean),
): Promise<void> {
  const matches =
    typeof expected === "string" ? (output: string) => output.includes(expected) : expected;
  const child = app.process();
  let exited = child.exitCode !== null || child.signalCode !== null;
  const markExited = (): void => {
    exited = true;
  };
  child.once("close", markExited);
  try {
    while (true) {
      if (matches(logs.join(""))) {
        return;
      }
      if (exited) {
        throw new Error("the register's process exited before it logged what was expected");
      }
      await new Promise((resolve) => setTimeout(resolve, RECHECK_INTERVAL_MS));
    }
  } finally {
    child.off("close", markExited);
  }
}
