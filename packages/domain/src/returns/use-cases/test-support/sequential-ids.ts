import type { IdGenerator } from "../return-ports.js";

export class SequentialIds implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${this.count}`;
  }
}
