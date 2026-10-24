import type { ReadinessMiss } from "./core-supervisor";

export function reportCoreReadinessMiss(
  deps: {
    log: (line: string) => void;
    captureMessage: (message: string, level: "error") => void;
  },
  miss: ReadinessMiss,
  readinessTimeoutMs: number,
): void {
  const line =
    miss.step === undefined
      ? `core process: not ready within ${readinessTimeoutMs} ms, before reporting any startup step, so it was stopped`
      : `core process: not ready within ${readinessTimeoutMs} ms, still at step ${miss.step} after ${Math.round(miss.stepElapsedMs ?? 0)} ms, so it was stopped`;
  deps.log(line);
  deps.captureMessage(line, "error");
}
