import { randomUUID } from "node:crypto";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  locations,
  registerInstallations,
  registers,
  roles,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { issueDeviceToken } from "../register/device-token.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterReplenishment } from "./drizzle-register-replenishment.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let replenishment: DrizzleRegisterReplenishment<PostgresJsQueryResultHKT>;
let roleId: string;

const T0 = new Date("2026-09-01T10:00:00.000Z");

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_replenishment");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  replenishment = new DrizzleRegisterReplenishment(db);
  const [role] = await db.select({ id: roles.id }).from(roles).limit(1);
  if (!role) {
    throw new Error("test setup: no role seeded");
  }
  roleId = role.id;
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function hoursAfter(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function idStartingWith(prefix: string): string {
  return prefix + randomUUID().slice(prefix.length);
}

async function insertBranch(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the branch returned no row");
  }
  return location.id;
}

async function insertRegister(locationId: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: `Caja ${randomUUID()}` })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

async function insertInstallation(
  registerId: string,
  options: { id?: string; enrolledAt: Date; revokedAt?: Date },
): Promise<string> {
  const { lookupPrefix, tokenHash } = issueDeviceToken();
  const [installation] = await db
    .insert(registerInstallations)
    .values({
      ...(options.id !== undefined && { id: options.id }),
      registerId,
      tokenLookupPrefix: lookupPrefix,
      tokenHash,
      tokenIssuedAt: options.enrolledAt,
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: options.enrolledAt,
      revokedAt: options.revokedAt ?? null,
    })
    .returning({ id: registerInstallations.id });
  if (!installation) {
    throw new Error("test setup: seeding the installation returned no row");
  }
  return installation.id;
}

async function insertEvents(deviceId: string, seqs: number[]): Promise<void> {
  for (const deviceSeq of seqs) {
    await insertInboxEvent(db, deviceId, { deviceSeq });
  }
}

function positionsOf(events: { deviceId: string; event: { device_seq: number } }[]) {
  return events.map(({ deviceId, event }) => [deviceId, event.device_seq]);
}

async function aRegisterRestoredTwice() {
  const registerId = await insertRegister(await insertBranch());
  const predecessor = await insertInstallation(registerId, {
    id: idStartingWith("ffffffff"),
    enrolledAt: T0,
    revokedAt: hoursAfter(T0, 5),
  });
  const second = await insertInstallation(registerId, {
    id: idStartingWith("00000000"),
    enrolledAt: hoursAfter(T0, 2),
    revokedAt: hoursAfter(T0, 6),
  });
  const third = await insertInstallation(registerId, { enrolledAt: hoursAfter(T0, 4) });
  return { registerId, predecessor, second, third };
}

describe("the standing of a predecessor installation", () => {
  it("is not of the register when no installation has the id", async () => {
    const registerId = await insertRegister(await insertBranch());

    expect(await replenishment.predecessorStanding(registerId, randomUUID())).toBe(
      "not_of_register",
    );
  });

  it("is not of the register when the installation belongs to another register", async () => {
    const branchId = await insertBranch();
    const registerId = await insertRegister(branchId);
    const otherRegisterId = await insertRegister(branchId);
    const otherInstallation = await insertInstallation(otherRegisterId, {
      enrolledAt: T0,
      revokedAt: hoursAfter(T0, 1),
    });

    expect(await replenishment.predecessorStanding(registerId, otherInstallation)).toBe(
      "not_of_register",
    );
  });

  it("is not revoked while the installation is still active", async () => {
    const registerId = await insertRegister(await insertBranch());
    const installation = await insertInstallation(registerId, { enrolledAt: T0 });

    expect(await replenishment.predecessorStanding(registerId, installation)).toBe("not_revoked");
  });

  it("is revoked once the installation was revoked", async () => {
    const registerId = await insertRegister(await insertBranch());
    const installation = await insertInstallation(registerId, {
      enrolledAt: T0,
      revokedAt: hoursAfter(T0, 1),
    });

    expect(await replenishment.predecessorStanding(registerId, installation)).toBe("revoked");
  });
});

describe("the events of a register above a predecessor position", () => {
  it("holds the predecessor's events above the last acknowledged sequence, whatever their state", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice();
    await insertEvents(predecessor, [1, 2, 3]);
    await insertInboxEvent(db, predecessor, { deviceSeq: 4, appliedAt: T0 });
    await insertInboxEvent(db, predecessor, {
      deviceSeq: 5,
      quarantinedAt: T0,
      lastError: "invalid payload",
    });

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 3 },
      undefined,
      100,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 4],
      [predecessor, 5],
    ]);
  });

  it("holds every event of the installations enrolled after the predecessor, in enrollment order and then sequence", async () => {
    const { registerId, predecessor, second, third } = await aRegisterRestoredTwice();
    await insertEvents(predecessor, [1, 2]);
    await insertEvents(third, [2, 1]);
    await insertEvents(second, [3, 1]);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 1 },
      undefined,
      100,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 2],
      [second, 1],
      [second, 3],
      [third, 1],
      [third, 2],
    ]);
  });

  it("leaves out the events of installations enrolled before the predecessor and of other registers", async () => {
    const { registerId, predecessor, second } = await aRegisterRestoredTwice();
    const earlier = await insertInstallation(registerId, {
      enrolledAt: hoursAfter(T0, -3),
      revokedAt: hoursAfter(T0, -2),
    });
    const otherRegisterId = await insertRegister(await insertBranch());
    const ofAnotherRegister = await insertInstallation(otherRegisterId, {
      enrolledAt: hoursAfter(T0, 3),
    });
    await insertEvents(earlier, [1]);
    await insertEvents(ofAnotherRegister, [1]);
    await insertEvents(second, [1]);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
    );

    expect(positionsOf(events)).toEqual([[second, 1]]);
  });

  it("carries each event as the register pushed it", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice();
    const eventId = await insertInboxEvent(db, predecessor, {
      deviceSeq: 1,
      aggregateType: "sale",
      aggregateId: "sale-1",
      eventType: "sale_line_added",
      schemaVersion: 3,
      payload: { quantity: 2, note: null },
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
      actorId: "user-1",
      chainHmac: "chain",
    });

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
    );

    expect(events).toEqual([
      {
        deviceId: predecessor,
        event: {
          event_id: eventId,
          device_seq: 1,
          aggregate_type: "sale",
          aggregate_id: "sale-1",
          event_type: "sale_line_added",
          schema_version: 3,
          payload: { quantity: 2, note: null },
          occurred_at: "2026-10-01T09:00:00.000Z",
          actor_id: "user-1",
          chain_hmac: "chain",
        },
      },
    ]);
  });

  it("holds no more events than the limit", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice();
    await insertEvents(predecessor, [1, 2, 3]);

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      2,
    );

    expect(positionsOf(events)).toEqual([
      [predecessor, 1],
      [predecessor, 2],
    ]);
  });

  it("continues strictly after an event, across installations", async () => {
    const { registerId, predecessor, second, third } = await aRegisterRestoredTwice();
    await insertEvents(predecessor, [1, 2]);
    await insertEvents(second, [1, 2]);
    await insertEvents(third, [1]);
    const position = { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 };

    const withinInstallation = await replenishment.ownEventsAbove(
      registerId,
      position,
      { deviceId: second, deviceSeq: 1 },
      100,
    );
    const acrossInstallations = await replenishment.ownEventsAbove(
      registerId,
      position,
      { deviceId: predecessor, deviceSeq: 2 },
      2,
    );

    expect(positionsOf(withinInstallation)).toEqual([
      [second, 2],
      [third, 1],
    ]);
    expect(positionsOf(acrossInstallations)).toEqual([
      [second, 1],
      [second, 2],
    ]);
  });

  it("refuses to continue after an installation that does not exist", async () => {
    const { registerId, predecessor } = await aRegisterRestoredTwice();

    await expect(
      replenishment.ownEventsAbove(
        registerId,
        { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
        { deviceId: randomUUID(), deviceSeq: 1 },
        100,
      ),
    ).rejects.toThrow();
  });
});

describe("the users of a register's branch", () => {
  async function insertUser(
    locationId: string,
    firstName: string,
    options: { active?: boolean; pin?: { salt: string; hash: string } } = {},
  ): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        firstName,
        email: `${randomUUID()}@example.com`,
        locationId,
        active: options.active ?? true,
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId });
    if (options.pin) {
      await db.insert(userPins).values({ userId: user.id, ...options.pin, setAt: T0 });
    }
    return user.id;
  }

  it("holds each user of the branch with the salt and digest of the PIN, and none of another branch", async () => {
    const branchId = await insertBranch();
    const registerId = await insertRegister(branchId);
    const ana = await insertUser(branchId, "Ana", { pin: { salt: "c2FsdA", hash: "aGFzaA" } });
    const beto = await insertUser(branchId, "Beto", { active: false });
    await insertUser(await insertBranch(), "Carla", { pin: { salt: "s", hash: "h" } });

    const branchUsers = await replenishment.branchUsers(registerId);

    expect(branchUsers).toHaveLength(2);
    expect(branchUsers.find(({ userId }) => userId === ana)).toEqual({
      userId: ana,
      firstName: "Ana",
      roleId,
      salt: "c2FsdA",
      pinHash: "aGFzaA",
      active: true,
      version: 1,
    });
    expect(branchUsers.find(({ userId }) => userId === beto)).toEqual({
      userId: beto,
      firstName: "Beto",
      roleId,
      salt: null,
      pinHash: null,
      active: false,
      version: 1,
    });
  });
});
