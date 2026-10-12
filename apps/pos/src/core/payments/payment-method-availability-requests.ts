import type { PaymentMethodAvailability } from "@purosur/contracts";
import { pointTerminalAvailability, qrAvailability } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { currentSaleFor, type SaleRequestDeps } from "../sales/sale-requests";
import type { CloudReachability } from "../sync/cloud-reachability";

export async function paymentMethodAvailabilityFor({
  database,
  gate,
  now,
  cloud,
}: Pick<SaleRequestDeps, "gate" | "now"> & {
  database: LocalDatabase;
  cloud: () => CloudReachability;
}): Promise<PaymentMethodAvailability | null> {
  const sale = await currentSaleFor({ database, gate, now });
  if (sale === null || sale === "not_permitted") {
    return null;
  }
  const cloudReachable = cloud() === "reachable";
  return {
    qr: qrAvailability(cloudReachable),
    point: pointTerminalAvailability(cloudReachable, sale.pending),
  };
}
