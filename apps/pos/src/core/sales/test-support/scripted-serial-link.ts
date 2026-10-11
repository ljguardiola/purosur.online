import type { SerialLink } from "../systel-scale.js";

export class ScriptedSerialLink implements SerialLink {
  readonly written: number[][] = [];
  closed = false;
  onWrite: (request: number[]) => void = () => {};
  private readonly dataListeners: ((chunk: Uint8Array) => void)[] = [];
  private readonly endListeners: (() => void)[] = [];

  write(data: Uint8Array): void {
    this.written.push([...data]);
    this.onWrite([...data]);
  }

  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "error" | "close", listener: () => void): void;
  on(event: "data" | "error" | "close", listener: ((chunk: Uint8Array) => void) | (() => void)) {
    if (event === "data") {
      this.dataListeners.push(listener as (chunk: Uint8Array) => void);
    } else {
      this.endListeners.push(listener as () => void);
    }
  }

  close(): void {
    this.closed = true;
  }

  receive(...bytes: number[]): void {
    for (const listener of this.dataListeners) listener(Uint8Array.from(bytes));
  }

  fail(): void {
    for (const listener of this.endListeners) listener();
  }
}
