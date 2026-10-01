import {
  type FiscalAuthorization,
  fiscalAuthorizationAfter,
} from "../model/fiscal-authorization.js";
import type { FiscalAuthorizationReader } from "./fiscal-gate-ledger.js";

export interface ReadFiscalAuthorizationPorts {
  reader: FiscalAuthorizationReader;
}

export function readFiscalAuthorization({
  reader,
}: ReadFiscalAuthorizationPorts): FiscalAuthorization {
  return fiscalAuthorizationAfter(reader.latestPreEmissionGateOutcome());
}
