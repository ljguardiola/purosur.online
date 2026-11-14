import type { WeighingReading } from "../../shared/index.js";

export type LiveScaleReading =
  | { kind: "reading"; weightThousandths: number; settled: boolean }
  | { kind: "settling" }
  | { kind: "no_reading" };

export function liveScaleReading(reading: WeighingReading): LiveScaleReading {
  switch (reading.kind) {
    case "stable":
    case "held_stable":
      return { kind: "reading", weightThousandths: reading.weightThousandths, settled: true };
    case "unstable":
      return { kind: "reading", weightThousandths: reading.weightThousandths, settled: false };
    case "not_stable":
      return { kind: "settling" };
    case "unavailable":
      return { kind: "no_reading" };
  }
}
