import {
  exceptionShareBreachAlert,
  fiscalAddressMonthScope,
} from "../model/exception-share-alerts.js";
import type { ExceptionShareBreachDetectionPorts } from "./exception-share-breach-ports.js";

export async function detectExceptionShareBreaches({
  breaches,
  alerts,
}: ExceptionShareBreachDetectionPorts): Promise<number> {
  const recorded = await breaches.recordedBreaches();
  let opened = 0;
  for (const breach of recorded) {
    const scope = fiscalAddressMonthScope(breach.fiscalAddressId, breach.month);
    if (await alerts.hasOpenedBreachAlert(scope)) {
      continue;
    }
    const ofSameAddress = recorded
      .filter((each) => each.fiscalAddressId === breach.fiscalAddressId)
      .map((each) => each.month);
    await alerts.openBreachAlert(exceptionShareBreachAlert(breach, ofSameAddress));
    opened += 1;
  }
  return opened;
}
