export type ScaleReading =
  | { kind: "stable"; weightThousandths: number }
  | { kind: "not_stable" }
  | { kind: "unavailable" };

export interface Scale {
  read(): Promise<ScaleReading>;
}
