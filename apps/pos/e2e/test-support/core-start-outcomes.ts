export const CORE_READY = "core: the local database is ready";
export const CORE_DAMAGED =
  "core: the local database is damaged, so the register is out of service";

// Every launch ends its core's start with exactly one of these: an outcome the core logs, or main
// giving up on a core that kept crashing before it logged one.
const CORE_START_ENDINGS = [
  CORE_READY,
  CORE_DAMAGED,
  "core: the local database could not be opened",
  "core: no local data folder was handed over",
  "core process: restart attempts exhausted",
] as const;

export function startEndingsIn(output: string): string[] {
  return CORE_START_ENDINGS.filter((ending) => output.includes(ending));
}

export function coreStartEnded(output: string): boolean {
  return startEndingsIn(output).length > 0;
}
