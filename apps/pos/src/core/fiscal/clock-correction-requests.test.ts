import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  type ClockCorrectionRequestDeps,
  correctRegisterClockFor,
  readClockGuardFor,
} from "./clock-correction-requests";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const AHEAD = "2026-10-01T16:00:00.000Z";
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let idCount: number;
let chainKey: string | undefined;

function deps(now = NOW): ClockCorrectionRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => "pepper",
      hashPin: async () => "hash",
      now: () => now,
    }),
    signedInPerson,
    readOutboxChainKey: async () => chainKey,
    now: () => now,
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
  };
}

function addPerson(id: string, permissions: string[]) {
  database
    .prepare(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-${id}', 'Rol', 0, 1)`,
    )
    .run();
  for (const key of permissions) {
    database
      .prepare(
        `INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-${id}', ?, 1)`,
      )
      .run(key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ana', ?, 's', 1, 1)",
    )
    .run(id, `role-${id}`);
}

function setMark(pointOfSale: number, reading: string) {
  database
    .prepare(
      "INSERT INTO register_clock_marks (point_of_sale, document_type, reading) VALUES (?, 'factura_c', ?)",
    )
    .run(pointOfSale, reading);
}

function openSession(id: string) {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES (?, 'register-1', 'device-1', 'u1', '2026-10-01T09:00:00.000Z', 0, 'OPEN')`,
    )
    .run(id);
}

function closeSession(id: string) {
  database
    .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ? WHERE id = ?")
    .run("2026-10-01T14:00:00.000Z", id);
}

function marks() {
  return database
    .prepare("SELECT point_of_sale, reading FROM register_clock_marks ORDER BY point_of_sale")
    .all();
}

beforeEach(() => {
  idCount = 0;
  chainKey = CHAIN_KEY;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';`,
  );
  addPerson("u1", ["correct_register_clock"]);
  addPerson("u2", ["sell_and_charge"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("correcting the register's clock from the register", () => {
  it("lowers the marks ahead of the reading to the reading and reports each lowering", async () => {
    setMark(12, AHEAD);
    setMark(31, "2026-10-01T15:00:30.000Z");

    const outcome = await correctRegisterClockFor(deps());

    expect(outcome).toEqual({
      kind: "corrected",
      lowerings: [
        {
          point_of_sale: 12,
          document_type: "factura_c",
          previous_reading: AHEAD,
          corrected_reading: NOW.toISOString(),
        },
      ],
    });
    expect(marks()).toEqual([
      { point_of_sale: 12, reading: NOW.toISOString() },
      { point_of_sale: 31, reading: "2026-10-01T15:00:30.000Z" },
    ]);
  });

  it("records the correction in the open cash session and gives its event to the outbox for the cloud", async () => {
    setMark(12, AHEAD);
    openSession("session-1");

    await correctRegisterClockFor(deps());

    expect(
      database.prepare("SELECT period, actor_id, point_of_sale FROM clock_corrections").all(),
    ).toEqual([{ period: "session-1", actor_id: "u1", point_of_sale: 12 }]);
    const [event] = database
      .prepare<[], { event_type: string; aggregate_id: string; actor_id: string; payload: string }>(
        "SELECT event_type, aggregate_id, actor_id, payload FROM outbox",
      )
      .all();
    expect(event).toMatchObject({
      event_type: "clock_corrected",
      aggregate_id: "register-1",
      actor_id: "u1",
    });
    expect(JSON.parse(event?.payload ?? "")).toEqual({
      point_of_sale: 12,
      document_type: "factura_c",
      previous_reading: AHEAD,
      corrected_reading: NOW.toISOString(),
    });
  });

  it("refuses a second correction within the same cash session, changing nothing", async () => {
    setMark(12, AHEAD);
    openSession("session-1");
    await correctRegisterClockFor(deps());
    setMark(31, AHEAD);

    const outcome = await correctRegisterClockFor(deps());

    expect(outcome).toEqual({ kind: "already_corrected_in_period" });
    expect(marks()).toEqual([
      { point_of_sale: 12, reading: NOW.toISOString() },
      { point_of_sale: 31, reading: AHEAD },
    ]);
  });

  it("allows one correction in the next cash session, and one between sessions that does not use up the next", async () => {
    setMark(12, AHEAD);
    openSession("session-1");
    await correctRegisterClockFor(deps());
    closeSession("session-1");

    setMark(31, AHEAD);
    expect(await correctRegisterClockFor(deps())).toMatchObject({ kind: "corrected" });
    expect(await correctRegisterClockFor(deps())).toEqual({ kind: "not_behind" });

    openSession("session-2");
    setMark(7, AHEAD);
    expect(await correctRegisterClockFor(deps())).toMatchObject({ kind: "corrected" });
  });

  it("refuses a second correction with no session open since the last one closed", async () => {
    openSession("session-1");
    closeSession("session-1");
    setMark(12, AHEAD);
    await correctRegisterClockFor(deps());
    setMark(31, AHEAD);

    expect(await correctRegisterClockFor(deps())).toEqual({ kind: "already_corrected_in_period" });
  });

  it("answers that the clock is not behind when no mark is more than a minute ahead of it", async () => {
    setMark(12, "2026-10-01T15:01:00.000Z");

    expect(await correctRegisterClockFor(deps())).toEqual({ kind: "not_behind" });
  });

  it("is refused to a person without the permission, changing nothing", async () => {
    setMark(12, AHEAD);
    signedInPerson.set("u2");

    expect(await correctRegisterClockFor(deps())).toEqual({ kind: "not_permitted" });
    expect(marks()).toEqual([{ point_of_sale: 12, reading: AHEAD }]);
  });

  it("is refused when no one is signed in", async () => {
    setMark(12, AHEAD);
    signedInPerson.clear();

    expect(await correctRegisterClockFor(deps())).toEqual({ kind: "not_signed_in" });
  });

  it("is unavailable while the register cannot chain its events", async () => {
    setMark(12, AHEAD);
    chainKey = undefined;

    expect(await correctRegisterClockFor(deps())).toEqual({ kind: "unavailable" });
    expect(marks()).toEqual([{ point_of_sale: 12, reading: AHEAD }]);
  });
});

describe("reading the register's clock guard", () => {
  it("answers the reading, no block and nothing to correct on a fresh register", async () => {
    expect(await readClockGuardFor(deps())).toEqual({
      kind: "read",
      reading: NOW.toISOString(),
      blocks: [],
      may_correct: true,
      correction_available: false,
    });
  });

  it("answers the blocks with their mark and the tax authority's day, and whether a correction is available", async () => {
    setMark(12, AHEAD);
    database.exec(
      `INSERT INTO register_point_of_sale (
         register_id, point_of_sale_number, fiscal_address_id, tax_authority_last_authorized_number,
         tax_authority_last_authorized_issued_on, version
       ) VALUES ('register-1', 12, 'address-1', 40, '2026-10-02', 1)`,
    );

    expect(await readClockGuardFor(deps())).toEqual({
      kind: "read",
      reading: NOW.toISOString(),
      blocks: [
        {
          point_of_sale: 12,
          document_type: "factura_c",
          latest_reading: AHEAD,
          tax_authority_last_authorized_issued_on: "2026-10-02",
        },
      ],
      may_correct: true,
      correction_available: true,
    });
  });

  it("answers that a correction is no longer available once it was made in the period", async () => {
    setMark(12, AHEAD);
    openSession("session-1");
    await correctRegisterClockFor(deps());
    setMark(31, AHEAD);

    expect(await readClockGuardFor(deps())).toMatchObject({
      correction_available: false,
      blocks: [{ point_of_sale: 31 }],
    });
  });

  it("answers that a person without the permission may not correct", async () => {
    signedInPerson.set("u2");

    expect(await readClockGuardFor(deps())).toMatchObject({ kind: "read", may_correct: false });
  });

  it("answers that no one signed in may not correct, while still reading the guard", async () => {
    setMark(12, AHEAD);
    signedInPerson.clear();

    expect(await readClockGuardFor(deps())).toMatchObject({
      kind: "read",
      may_correct: false,
      blocks: [{ point_of_sale: 12 }],
    });
  });
});
