import type { MercadoPagoRefundKeys } from "../mercado-pago-refund-ports.js";

export class FakeMercadoPagoRefundKeys implements MercadoPagoRefundKeys {
  readonly issued: string[] = [];

  newRefundKey(): string {
    const key = `refund-key-${this.issued.length + 1}`;
    this.issued.push(key);
    return key;
  }
}
