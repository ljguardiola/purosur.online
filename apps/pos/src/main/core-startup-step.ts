import type { CoreStartupStep } from "@purosur/contracts";

const KNOWN_STEPS: Record<CoreStartupStep, true> = {
  set_aside_stale_database: true,
  adopt_staged_snapshot: true,
  check_local_database: true,
  apply_migrations: true,
};

function isKnownStep(step: string): step is CoreStartupStep {
  return Object.hasOwn(KNOWN_STEPS, step);
}

export function readCoreStartupStep(message: unknown): CoreStartupStep | undefined {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "core-startup-step" &&
    "step" in message &&
    typeof message.step === "string" &&
    isKnownStep(message.step)
  ) {
    return message.step;
  }
  return undefined;
}
