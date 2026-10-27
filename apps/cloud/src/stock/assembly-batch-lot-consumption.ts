import { getTableName, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { lotAllocations, lots, stockMovements } from "../platform/db/schema.js";

// A single-table query drops the table qualifier of a column it renders, and this condition must
// tell its own tables' columns from the batch it is correlated with.
function qualified(column: AnyPgColumn): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

// A batch's lot has had a consumption when any allocation reaches it from a movement other than
// the batch's own assembly_in, which is what filled it.
export function batchLotConsumed(batchId: AnyPgColumn): SQL<boolean> {
  const batch = qualified(batchId);
  return sql<boolean>`exists (
    select 1
    from ${lotAllocations}
    inner join ${lots} on ${qualified(lots.id)} = ${qualified(lotAllocations.lotId)}
    inner join ${stockMovements} on ${qualified(stockMovements.id)} = ${qualified(lotAllocations.movementId)}
    where ${qualified(lots.assemblyBatchId)} = ${batch}
      and not (${qualified(stockMovements.kind)} = 'assembly_in' and ${qualified(stockMovements.assemblyBatchId)} = ${batch})
  )`;
}
