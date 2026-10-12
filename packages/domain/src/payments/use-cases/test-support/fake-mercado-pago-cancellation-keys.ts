import type { MercadoPagoCancellationKeys } from "../mercado-pago-order-ports.js";

export class FakeMercadoPagoCancellationKeys implements MercadoPagoCancellationKeys {
  readonly issued: string[] = [];

  newCancellationKey(): string {
    const key = `cancellation-key-${this.issued.length + 1}`;
    this.issued.push(key);
    return key;
  }
}
