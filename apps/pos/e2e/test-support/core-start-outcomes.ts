export const CORE_READY = "core: the local database is ready";
export const CORE_DAMAGED =
  "core: the local database is damaged, so the register is out of service";
export const CORE_NOT_OPENED = "core: the local database could not be opened";
export const CORE_WITHOUT_DATA_FOLDER = "core: no local data folder was handed over";

export const CORE_START_OUTCOMES = [
  CORE_READY,
  CORE_DAMAGED,
  CORE_NOT_OPENED,
  CORE_WITHOUT_DATA_FOLDER,
] as const;

export function startOutcomesIn(output: string): string[] {
  return CORE_START_OUTCOMES.filter((outcome) => output.includes(outcome));
}

export function loggedAStartOutcome(output: string): boolean {
  return startOutcomesIn(output).length > 0;
}
