import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { OfflineAuthorizationCode } from "./offline-authorization-code-ports.js";

export interface HeldOfflineAuthorizationCodeReader {
  heldCodeOf(fortnight: Fortnight): Promise<OfflineAuthorizationCode | null>;
}

export interface CurrentOfflineAuthorizationCodePorts {
  codes: HeldOfflineAuthorizationCodeReader;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}
