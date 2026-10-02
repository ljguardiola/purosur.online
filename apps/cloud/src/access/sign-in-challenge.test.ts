import { CHALLENGE_TTL_MS } from "@purosur/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  DrizzleSignInChallenges,
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

describe("DrizzleSignInChallenges", () => {
  it("takes a stored challenge and answers when it was issued", async () => {
    await storeSignInChallenge(db, { challenge: "abc123", now: NOON });

    const taken = await new DrizzleSignInChallenges(db).takeChallenge("abc123");

    expect(taken).toEqual({ issuedAt: NOON });
  });

  it("deletes the row once taken, so a challenge is taken only once", async () => {
    await storeSignInChallenge(db, { challenge: "abc123", now: NOON });
    await new DrizzleSignInChallenges(db).takeChallenge("abc123");

    const again = await new DrizzleSignInChallenges(db).takeChallenge("abc123");

    expect(again).toBeUndefined();
    expect((await challengeRows()).rows).toEqual([]);
  });

  it("takes nothing for a challenge that was never stored", async () => {
    const taken = await new DrizzleSignInChallenges(db).takeChallenge("never-issued");

    expect(taken).toBeUndefined();
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
