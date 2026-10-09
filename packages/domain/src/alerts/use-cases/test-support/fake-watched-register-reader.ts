import type { WatchedRegister } from "../../../register/index.js";
import type { WatchedRegisterReader } from "../watched-register-reader.js";

export class FakeWatchedRegisterReader implements WatchedRegisterReader {
  reads = 0;
  private readonly registers: WatchedRegister[];

  constructor(registers: WatchedRegister[]) {
    this.registers = structuredClone(registers);
  }

  async watchedRegisters(): Promise<WatchedRegister[]> {
    this.reads += 1;
    return structuredClone(this.registers);
  }
}
