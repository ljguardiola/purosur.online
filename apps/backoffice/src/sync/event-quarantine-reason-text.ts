import type { EventQuarantineReason } from "@purosur/contracts";
import { ofSyncedAggregate } from "./synced-event-names";

export function eventQuarantineReasonText(reason: EventQuarantineReason): string {
  switch (reason.kind) {
    case "unreadable":
      return "la nube no puede leer lo que envió la caja";
    case "missing_dependency":
      return `depende ${ofSyncedAggregate(reason)}, que todavía no se aplicó`;
    case "not_recorded":
      return "la nube no lo pudo guardar";
  }
}
