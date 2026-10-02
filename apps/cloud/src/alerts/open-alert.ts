import type { OpenAlertInput } from "@purosur/domain";
import {
  type OpenAlertOutcome,
  openAlert as openAlertUseCase,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

export type { OpenAlertInput, OpenAlertOutcome };

export interface OpenAlertDeps {
  now: () => Date;
}

export function openAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  input: OpenAlertInput,
  deps: OpenAlertDeps,
): Promise<OpenAlertOutcome> {
  return openAlertUseCase({ store: new DrizzleAlertStore(tx), clock: { now: deps.now } }, input);
}
