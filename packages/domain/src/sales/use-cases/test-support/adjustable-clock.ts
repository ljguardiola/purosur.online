import type { Clock } from "../../../shared/index.js";

export class AdjustableClock implements Clock {
  private moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  set(moment: Date): void {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }
}
