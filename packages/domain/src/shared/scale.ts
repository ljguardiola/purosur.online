export type ScaleReading =
  | { kind: "stable"; weightThousandths: number }
  | { kind: "unstable"; weightThousandths: number }
  | { kind: "not_stable" }
  | { kind: "unavailable" };

export type WeighingReading = ScaleReading | { kind: "held_stable"; weightThousandths: number };

export interface Scale {
  read(): Promise<WeighingReading>;
}
