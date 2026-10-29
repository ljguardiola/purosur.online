import { cancellableWithoutAuthorization } from "../../payments/index.js";

export function cancelledBeforeCharge(payments: readonly { state: string }[]): boolean {
  return cancellableWithoutAuthorization(payments);
}
