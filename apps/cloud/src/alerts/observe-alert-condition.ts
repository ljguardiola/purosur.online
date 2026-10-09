import {
  type AlertConditionObservation,
  type ObserveAlertConditionOutcome,
  observeAlertCondition as observeAlertConditionUseCase,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

export type { AlertConditionObservation, ObserveAlertConditionOutcome };

export interface ObserveAlertConditionDeps {
  now: () => Date;
}

export function observeAlertCondition<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  observation: AlertConditionObservation,
  deps: ObserveAlertConditionDeps,
): Promise<ObserveAlertConditionOutcome> {
  return observeAlertConditionUseCase(
    {
      store: new DrizzleAlertStore(tx, deps.now),
      clock: { now: deps.now },
      hasher: { hash: hashSourceAddress },
    },
    observation,
  );
}
