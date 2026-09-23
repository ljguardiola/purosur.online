import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  CHALLENGE_TTL_MS,
  consumeSignInChallenge,
  pruneExpiredSignInChallenges,
  storeSignInChallenge,
} from "./sign-in-challenge.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let client: TestDatabase["client"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  client = testDatabase.client;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
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
