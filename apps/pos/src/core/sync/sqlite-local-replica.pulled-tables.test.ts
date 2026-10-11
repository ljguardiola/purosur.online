import { PULLED_ENTITIES } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { PULLED_TABLES } from "./pulled-tables";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import { changesOfEntity } from "./test-support/pulled-changes-of-every-entity";
import { openAdoptedReplica } from "./test-support/sqlite-local-replica";

const BOOKKEEPING_TABLES = new Set(["sync_state", "applied_migrations"]);

function contentsOfTables(database: LocalDatabase): Map<string, string> {
  const names = database
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((table) => table.name)
    .filter((name) => !BOOKKEEPING_TABLES.has(name));
  return new Map(
    names.map((name) => [name, JSON.stringify(database.prepare(`SELECT * FROM "${name}"`).all())]),
  );
}

async function tablesChangedBy(
  database: LocalDatabase,
  steps: readonly (() => Promise<void>)[],
): Promise<string[]> {
  const changed = new Set<string>();
  for (const step of steps) {
    const before = contentsOfTables(database);
    await step();
    for (const [name, contents] of contentsOfTables(database)) {
      if (before.get(name) !== contents) {
        changed.add(name);
      }
    }
  }
  return [...changed].sort();
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the tables the register fills from what it pulls", () => {
  it.each(PULLED_ENTITIES)("are, for %s, exactly the ones its changes write", async (entity) => {
    const changed = await tablesChangedBy(
      database,
      changesOfEntity(entity).map(
        (change) => () =>
          replica.savePage({ changes: [change], cursor: change.changeSeq, hasMore: false }),
      ),
    );

    const declared = Object.entries(PULLED_TABLES)
      .filter(([, pulledEntity]) => pulledEntity === entity)
      .map(([table]) => table)
      .sort();
    expect(changed).toEqual(declared);
    expect(declared.length).toBeGreaterThan(0);
  });
});
