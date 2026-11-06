import type { ScaleReading, WeighingReading } from "./scale.js";

const STABLE_READING_HOLD_MS = 300;

export interface LastStableReading {
  weightThousandths: number;
  at: Date;
}

export interface SteadiedReading {
  reading: WeighingReading;
  lastStable: LastStableReading | undefined;
}

export function steadyScaleReading(
  reading: ScaleReading,
  lastStable: LastStableReading | undefined,
  now: Date,
): SteadiedReading {
  if (reading.kind === "stable") {
    return { reading, lastStable: { weightThousandths: reading.weightThousandths, at: now } };
  }
  if (
    lastStable === undefined ||
    reading.kind === "unavailable" ||
    (reading.kind === "unstable" && reading.weightThousandths !== lastStable.weightThousandths) ||
    now.getTime() - lastStable.at.getTime() > STABLE_READING_HOLD_MS
  ) {
    return { reading, lastStable: undefined };
  }
  return {
    reading: { kind: "held_stable", weightThousandths: lastStable.weightThousandths },
    lastStable,
  };
}
