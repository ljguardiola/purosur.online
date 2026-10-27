import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { type FiscalEmissionMode, fiscalEmissionModeOf } from "../model/fiscal-emission-mode.js";
import { invoiceOwnFortnight } from "../model/real-time-authorization.js";
import type { FiscalEmissionModeReads } from "./fiscal-emission-mode-ports.js";

export function readFiscalEmissionMode(
  reads: FiscalEmissionModeReads,
  clock: Clock,
  zoneRules: ZoneRulesSource,
): FiscalEmissionMode {
  const now = clock.now();
  const rules = zoneRules.zoneRules();
  return fiscalEmissionModeOf({
    online: reads.fiscalOnlineEvidence(),
    now,
    series: reads.realTimeSeries(),
    offlineSeries: reads.offlineSeries(),
    offlineAuthorizationCode: reads.offlineAuthorizationCodeOf(invoiceOwnFortnight(now, rules)),
    latestGate: reads.latestPreEmissionGateOutcome(),
    rules,
  });
}
