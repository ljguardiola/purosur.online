import type { BatteryReading } from "@purosur/domain";

export interface BatteryReader {
  read(): Promise<BatteryReading>;
}
