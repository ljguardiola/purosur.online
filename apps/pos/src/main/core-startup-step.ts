import type { CoreStartupStep } from "@purosur/contracts";

const KNOWN_STEPS: ReadonlySet<string> = new Set<CoreStartupStep>([
  "set_aside_stale_database",
  "adopt_staged_snapshot",
  "check_local_database",
  "apply_migrations",
]);

export function readCoreStartupStep(message: unknown): CoreStartupStep | undefined {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "core-startup-step" &&
    "step" in message &&
    typeof message.step === "string" &&
    KNOWN_STEPS.has(message.step)
  ) {
    return message.step as CoreStartupStep;
  }
  return undefined;
}
