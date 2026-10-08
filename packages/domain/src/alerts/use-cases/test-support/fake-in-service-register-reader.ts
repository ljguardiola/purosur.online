import type { InServiceRegister, InServiceRegisterReader } from "../in-service-register-reader.js";

export class FakeInServiceRegisterReader implements InServiceRegisterReader {
  reads = 0;
  private readonly registers: InServiceRegister[];

  constructor(registers: InServiceRegister[]) {
    this.registers = structuredClone(registers);
  }

  async inServiceRegisters(): Promise<InServiceRegister[]> {
    this.reads += 1;
    return structuredClone(this.registers);
  }
}
