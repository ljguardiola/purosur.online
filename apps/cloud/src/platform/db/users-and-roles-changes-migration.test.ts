import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const OTHER_LOCATION = "00000000-0000-4000-8000-0000000000f1";
const USER_A = "00000000-0000-4000-8000-0000000000a1";
const USER_B = "00000000-0000-4000-8000-0000000000a2";
const ROLE_A = "00000000-0000-4000-8000-0000000000b1";
const ROLE_B = "00000000-0000-4000-8000-0000000000b2";

describe("the users and roles changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing user with its branch and every existing role as an insert, so a register pulling from the start receives them", async () => {
    const database = await databaseBeforeMigration("_users_and_roles_changes");

    const { rows: seededLocations } = await database.query<{ id: string }>(
      "select id from locations",
    );
    const seededLocation = seededLocations[0]?.id;
    const { rows: seededRoles } = await database.query<{ id: string }>("select id from roles");
    const administratorRole = seededRoles[0]?.id;
    await database.query("insert into locations (id) values ($1)", [OTHER_LOCATION]);
    await database.query(
      `insert into users (id, first_name, email, location_id, version, active)
       values ($1, 'Grace', 'grace@example.com', $3, 4, false),
              ($2, 'Ada', 'ada@example.com', $4, 1, true)`,
      [USER_B, USER_A, OTHER_LOCATION, seededLocation],
    );
    await database.query(
      "insert into roles (id, name, version) values ($1, 'Cajera', 1), ($2, 'Encargado', 6)",
      [ROLE_B, ROLE_A],
    );
    const { rows: before } = await database.query("select entity from changes");

    const migrated = await database.applyMigration();

    const { rows: logged } = await migrated.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { op: "insert", origin_device_id: null };
    expect(logged).toEqual([
      { ...insert, entity: "user", entity_id: USER_A, version: 1, location_id: seededLocation },
      { ...insert, entity: "user", entity_id: USER_B, version: 4, location_id: OTHER_LOCATION },
      ...[
        { id: administratorRole, version: 1 },
        { id: ROLE_A, version: 6 },
        { id: ROLE_B, version: 1 },
      ]
        .sort((first, second) => (first.id ?? "").localeCompare(second.id ?? ""))
        .map(({ id, version }) => ({
          ...insert,
          entity: "role",
          entity_id: id,
          version,
          location_id: null,
        })),
    ]);
  });
});
