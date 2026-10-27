export const CORE_READY = "core: the local database is ready";
export const CORE_DAMAGED =
  "core: the local database is damaged, so the register is out of service";

// A launch's core start has ended once its logs hold any of these: an outcome the core logs, main
// stopping a core that missed its readiness deadline, or main giving up on a core that kept
// crashing before it logged an outcome.
const CORE_START_ENDINGS = [
  CORE_READY,
  CORE_DAMAGED,
  "core: the local database could not be opened",
  "core: no local data folder was handed over",
  "core process: restart attempts exhausted",
  "core process: not ready within",
] as const;

export function startEndingsIn(output: string): string[] {
  return CORE_START_ENDINGS.filter((ending) => output.includes(ending));
}

export function coreStartEnded(output: string): boolean {
  return startEndingsIn(output).length > 0;
}
