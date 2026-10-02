import { isNotNull, isNull, type SQL } from "drizzle-orm";
import { alerts } from "../platform/db/schema.js";

export function openAlertCondition(): SQL {
  return isNull(alerts.resolvedAt);
}

export function closedAlertCondition(): SQL {
  return isNotNull(alerts.resolvedAt);
}
