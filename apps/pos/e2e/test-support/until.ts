import type { ChildProcess } from "node:child_process";

const RECHECK_INTERVAL_MS = 100;

type LoggingApp = {
  process(): Pick<ChildProcess, "exitCode" | "signalCode"> & {
    once(event: "close", listener: () => void): unknown;
    off(event: "close", listener: () => void): unknown;
  };
};

interface Wait {
  readonly withinMs: number;
  readonly waitingFor: string;
}

function timedOut({ withinMs, waitingFor }: Wait): Error {
  return new Error(`timed out after ${withinMs} ms waiting for ${waitingFor}`);
}

function startDeadline(withinMs: number): {
  readonly passed: () => boolean;
  readonly reached: Promise<void>;
  readonly clear: () => void;
} {
  let expired = false;
  let timer: NodeJS.Timeout | undefined;
  const reached = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, withinMs);
  });
  return { passed: () => expired, reached, clear: () => clearTimeout(timer) };
}

export async function until(holds: () => boolean | Promise<boolean>, wait: Wait): Promise<void> {
  const deadline = startDeadline(wait.withinMs);
  try {
    while (true) {
      const outcome = await Promise.race([
        Promise.resolve().then(holds),
        deadline.reached.then(() => false),
      ]);
      if (outcome) {
        return;
      }
      if (deadline.passed()) {
        throw timedOut(wait);
      }
      await new Promise((resolve) => setTimeout(resolve, RECHECK_INTERVAL_MS));
    }
  } finally {
    deadline.clear();
  }
}

export async function within<T>(promise: Promise<T>, wait: Wait): Promise<T> {
  const deadline = startDeadline(wait.withinMs);
  try {
    return await Promise.race([
      promise,
      deadline.reached.then((): never => {
        throw timedOut(wait);
      }),
    ]);
  } finally {
    deadline.clear();
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
  const markExited = (): void => {
    exited = true;
  };
  child.once("close", markExited);
  const deadline = startDeadline(withinMs);
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
      if (deadline.passed()) {
        throw new Error(
          `the register did not log ${awaited} within ${withinMs} ms; it logged:\n${logs.join("")}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, RECHECK_INTERVAL_MS));
    }
  } finally {
    deadline.clear();
    child.off("close", markExited);
  }
}
