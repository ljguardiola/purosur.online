import type { PointTerminals } from "../mercado-pago-order-ports.js";

export class FakePointTerminals implements PointTerminals {
  private readonly terminals = new Map<string, string>();
  private readonly operations: string[];

  constructor(operations: string[]) {
    this.operations = operations;
  }

  assign(registerId: string, terminalId: string) {
    this.terminals.set(registerId, terminalId);
  }

  unassign(registerId: string) {
    this.terminals.delete(registerId);
  }

  async terminalOfRegister(registerId: string): Promise<string | null> {
    this.operations.push("terminalOfRegister");
    return this.terminals.get(registerId) ?? null;
  }
}
