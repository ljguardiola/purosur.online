export type ScaleReading =
  | { kind: "stable"; weightThousandths: number }
  | { kind: "unstable"; weightThousandths: number }
  | { kind: "not_stable" }
  | { kind: "unavailable" };

export interface Scale {
  read(): Promise<ScaleReading>;
}
