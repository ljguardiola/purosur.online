import type { Scale, ScaleReading } from "../scale.js";

export class FakeScale implements Scale {
  reads = 0;
  private readonly readings: ScaleReading[];

  constructor(...readings: ScaleReading[]) {
    this.readings = readings;
  }

  read(): Promise<ScaleReading> {
    this.reads += 1;
    return Promise.resolve(this.readings.shift() ?? { kind: "unavailable" });
  }
}
