import type { PasskeyHolderScope, PasskeyHolders } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";

export function drizzlePasskeyHolders<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): PasskeyHolders {
  const branchUsers = drizzleBranchUsers(db);
  return {
    async passkeyHolder(locationId: string, userId: string, activeScope: PasskeyHolderScope) {
      const user = await branchUsers.branchUser(locationId, userId, activeScope);
      return user && { id: user.id };
    },
  };
}
