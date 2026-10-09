import {
  type ResolveAlertOutcome,
  resolveAlert as resolveAlertUseCase,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

export type { ResolveAlertOutcome };

export interface ResolveAlertDeps {
  now: () => Date;
}

export function resolveAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  alertId: string,
  deps: ResolveAlertDeps,
): Promise<ResolveAlertOutcome> {
  return resolveAlertUseCase(
    {
      store: new DrizzleAlertStore(tx, deps.now),
      clock: { now: deps.now },
      hasher: { hash: hashSourceAddress },
    },
    alertId,
  );
}
