import type { CriticalBatteryAction } from "@purosur/domain";

export interface CriticalBatteryActionReader {
  read(): Promise<CriticalBatteryAction>;
}
