import { type LastStableReading, steadyScaleReading } from "@purosur/domain";
import type { Clock, Scale, ScaleReading } from "@purosur/domain/sales/use-cases";

export interface ScaleDevice {
  read(): Promise<ScaleReading>;
}

export function steadyScale(device: ScaleDevice, clock: Clock): Scale {
  let lastStable: LastStableReading | undefined;
  return {
    async read() {
      const steadied = steadyScaleReading(await device.read(), lastStable, clock.now());
      lastStable = steadied.lastStable;
      return steadied.reading;
    },
  };
}
