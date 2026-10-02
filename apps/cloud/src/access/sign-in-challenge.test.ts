import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSignInChallenges } from "./sign-in-challenge.js";

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

function signInChallenges() {
  return new DrizzleSignInChallenges(db);
}

describe("DrizzleSignInChallenges", () => {
  it("takes a stored challenge and answers when it was issued", async () => {
    await signInChallenges().transaction((tx) => tx.storeChallenge("abc123", NOON));

    const taken = await signInChallenges().transaction((tx) => tx.takeChallenge("abc123"));

    expect(taken).toEqual({ issuedAt: NOON });
  });

  it("deletes the row once taken, so a challenge is taken only once", async () => {
    await signInChallenges().transaction((tx) => tx.storeChallenge("abc123", NOON));
    await signInChallenges().transaction((tx) => tx.takeChallenge("abc123"));

    const again = await signInChallenges().transaction((tx) => tx.takeChallenge("abc123"));

    expect(again).toBeUndefined();
    expect((await challengeRows()).rows).toEqual([]);
  });

  it("takes nothing for a challenge that was never stored", async () => {
    const taken = await signInChallenges().transaction((tx) => tx.takeChallenge("never-issued"));

    expect(taken).toBeUndefined();
  });

  it("undoes the discard when the store that follows it fails", async () => {
    await signInChallenges().transaction((tx) => tx.storeChallenge("expired", NOON));
    await signInChallenges().transaction((tx) =>
      tx.storeChallenge("taken", new Date(NOON.getTime() + 1)),
    );

    await expect(
      signInChallenges().transaction(async (tx) => {
        await tx.discardChallengesIssuedAtOrBefore(NOON);
        await tx.storeChallenge("taken", NOON);
      }),
    ).rejects.toThrow();

    const rows = (await challengeRows()).rows as { challenge: string }[];
    expect(rows.map((row) => row.challenge).sort()).toEqual(["expired", "taken"]);
  });
});

describe("DrizzleSignInChallenges.discardChallengesIssuedAtOrBefore", () => {
  it("removes the challenges issued at or before the cutoff and keeps the later ones", async () => {
    await signInChallenges().transaction(async (tx) => {
      await tx.storeChallenge("before", new Date(NOON.getTime() - 1));
      await tx.storeChallenge("at", NOON);
      await tx.storeChallenge("after", new Date(NOON.getTime() + 1));
    });

    await signInChallenges().transaction((tx) => tx.discardChallengesIssuedAtOrBefore(NOON));

    const rows = (await challengeRows()).rows as { challenge: string }[];
    expect(rows.map((row) => row.challenge)).toEqual(["after"]);
  });
});
