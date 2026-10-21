import { pullAudienceOf } from "@purosur/domain";
import type { PullReach } from "@purosur/domain/sync/use-cases";
import type { RegisterBranchUsers, ReplenishedUser } from "@purosur/domain/users/use-cases";
import { eq, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings, registers, users } from "../platform/db/schema.js";
import { readUsers } from "../sync/read-pulled-rows.js";

function usersInReach(reach: PullReach): SQL | undefined {
  switch (reach.kind) {
    case "every_row":
      return undefined;
    case "row":
      return eq(users.id, reach.id);
    case "rows_of_branch":
      return eq(users.locationId, reach.locationId);
    case "none":
      return sql`false`;
    case "rows_of_price_list":
    case "rows_of_register":
      throw new Error(`users are not reached by ${reach.kind}`);
  }
}

export class DrizzleRegisterBranchUsers<TQueryResult extends PgQueryResultHKT>
  implements RegisterBranchUsers
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async branchUsers(registerId: string): Promise<ReplenishedUser[]> {
    const [register] = await this.db
      .select({
        registerId: registers.id,
        locationId: registers.locationId,
        priceListId: branchSettings.priceListId,
      })
      .from(registers)
      .leftJoin(branchSettings, eq(branchSettings.locationId, registers.locationId))
      .where(eq(registers.id, registerId));
    if (!register) {
      throw new Error("an authenticated installation has no register");
    }
    const reached = await this.db
      .select({ id: users.id })
      .from(users)
      .where(usersInReach(pullAudienceOf(register).user));
    const rows = await readUsers(
      this.db,
      reached.map(({ id }) => id),
    );
    return [...rows].map(([userId, row]) => ({ userId, ...row }));
  }
}
