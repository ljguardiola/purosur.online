import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHALLENGE_TTL_MS,
  consumeSignInChallenge,
  pruneExpiredSignInChallenges,
  storeSignInChallenge,
} from "./sign-in-challenge.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await client.close();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");

async function challengeRows() {
  return client.query("select challenge from sign_in_challenges");
}

describe("consumeSignInChallenge", () => {
  it("accepts a challenge that was stored and is still fresh", async () => {
    await storeSignInChallenge(db, { challenge: "abc123", now: NOON });

    const result = await consumeSignInChallenge(db, { challenge: "abc123", now: NOON });

    expect(result).toBe(true);
  });

  it("consumes the challenge so it cannot be reused", async () => {
    await storeSignInChallenge(db, { challenge: "abc123", now: NOON });
    await consumeSignInChallenge(db, { challenge: "abc123", now: NOON });

    const result = await consumeSignInChallenge(db, { challenge: "abc123", now: NOON });

    expect(result).toBe(false);
  });

  it("deletes the row once consumed, whether or not it was accepted", async () => {
    await storeSignInChallenge(db, { challenge: "abc123", now: NOON });

    await consumeSignInChallenge(db, { challenge: "abc123", now: NOON });

    expect((await challengeRows()).rows).toEqual([]);
  });

  it("rejects a challenge that was never stored", async () => {
    const result = await consumeSignInChallenge(db, { challenge: "never-issued", now: NOON });

    expect(result).toBe(false);
  });

  it("rejects a challenge once it has aged past its lifetime", async () => {
    await storeSignInChallenge(db, { challenge: "abc123", now: NOON });

    const result = await consumeSignInChallenge(db, {
      challenge: "abc123",
      now: new Date(NOON.getTime() + CHALLENGE_TTL_MS + 1),
    });

    expect(result).toBe(false);
  });
});

describe("pruneExpiredSignInChallenges", () => {
  it("removes challenges that aged out without being consumed", async () => {
    await storeSignInChallenge(db, { challenge: "stale", now: NOON });
    await storeSignInChallenge(db, {
      challenge: "fresh",
      now: new Date(NOON.getTime() + CHALLENGE_TTL_MS + 1),
    });

    await pruneExpiredSignInChallenges(db, new Date(NOON.getTime() + CHALLENGE_TTL_MS + 1));

    const rows = (await challengeRows()).rows as { challenge: string }[];
    expect(rows.map((row) => row.challenge)).toEqual(["fresh"]);
  });
});
