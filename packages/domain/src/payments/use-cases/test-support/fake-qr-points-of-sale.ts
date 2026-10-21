import type { QrPointsOfSale } from "../mercado-pago-order-ports.js";

export class FakeQrPointsOfSale implements QrPointsOfSale {
  private readonly pointsOfSale = new Map<string, string>();
  private readonly operations: string[];

  constructor(operations: string[]) {
    this.operations = operations;
  }

  assign(registerId: string, externalPosId: string) {
    this.pointsOfSale.set(registerId, externalPosId);
  }

  unassign(registerId: string) {
    this.pointsOfSale.delete(registerId);
  }

  async pointOfSaleOfRegister(registerId: string): Promise<string | null> {
    this.operations.push("pointOfSaleOfRegister");
    return this.pointsOfSale.get(registerId) ?? null;
  }
}
