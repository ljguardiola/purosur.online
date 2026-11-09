import { countsAsContingencyTime, type FiscalEmissionMode } from "@purosur/domain";

export function readEmittingInContingencyTime(readMode: () => FiscalEmissionMode): boolean {
  return countsAsContingencyTime(readMode());
}
