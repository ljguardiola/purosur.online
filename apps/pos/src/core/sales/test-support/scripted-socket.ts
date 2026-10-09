import { EventEmitter } from "node:events";

export class ScriptedSocket extends EventEmitter {
  readonly written: Uint8Array[] = [];
  destroyed = false;

  write(data: Uint8Array): boolean {
    this.written.push(data);
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  connected(): void {
    this.emit("connect");
  }

  receive(...bytes: number[]): void {
    this.emit("data", Uint8Array.from(bytes));
  }
}
