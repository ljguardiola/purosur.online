import { confirmMercadoPagoRefund } from "../confirm-mercado-pago-refund.js";
import type { refundWorld } from "./mercado-pago-refund-world.js";

export function confirm(
  world: ReturnType<typeof refundWorld>,
  input: { refundId?: string; locationId?: string } = {},
) {
  return confirmMercadoPagoRefund(world.ports, {
    refundId: "refund-1",
    locationId: "branch-1",
    actorId: "manager",
    ...input,
  });
}
