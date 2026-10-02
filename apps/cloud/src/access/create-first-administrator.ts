import {
  type CreateFirstAdministratorInput,
  type CreateFirstAdministratorResult,
  createFirstAdministrator as createFirstAdministratorUseCase,
} from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleFirstAdministratorStore } from "./drizzle-first-administrator-store.js";

export {
  FirstAdministratorAlreadyBootstrappedError,
  InvalidFirstAdministratorInputError,
} from "@purosur/domain/access/use-cases";

export function createFirstAdministrator<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateFirstAdministratorInput,
): Promise<CreateFirstAdministratorResult> {
  return createFirstAdministratorUseCase({ store: new DrizzleFirstAdministratorStore(db) }, input);
}
