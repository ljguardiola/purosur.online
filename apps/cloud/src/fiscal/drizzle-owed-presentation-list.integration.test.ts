import type { ListedOwedPresentation } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { taxAuthorityOwedPresentations } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";

const AT = new Date("2026-10-16T12:00:00.000Z");
const LATER = new Date("2026-10-17T12:00:00.000Z");

const SEPTEMBER_FIRST_HALF_AT_4: ListedOwedPresentation = {
  pointOfSaleNumber: 4,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
};
const AUGUST_SECOND_HALF_AT_9: ListedOwedPresentation = {
  pointOfSaleNumber: 9,
  fortnight: { start: "2026-08-16", end: "2026-08-31" },
};

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("owed_presentation_list");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  await db.delete(taxAuthorityOwedPresentations);
});

const list = () => new DrizzleOwedPresentationList(db);

describe("the owed presentation list on a real Postgres", () => {
  it("lists nothing before the tax authority has listed a presentation", async () => {
    expect(await list().listed()).toEqual([]);
  });

  it("lists the presentations last recorded, with the fortnight each one covers", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4, AUGUST_SECOND_HALF_AT_9], AT);

    expect(await list().listed()).toEqual(
      expect.arrayContaining([SEPTEMBER_FIRST_HALF_AT_4, AUGUST_SECOND_HALF_AT_9]),
    );
    expect(await list().listed()).toHaveLength(2);
  });

  it("records when the presentation was listed", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4], AT);

    expect(
      await db
        .select({ listedAt: taxAuthorityOwedPresentations.listedAt })
        .from(taxAuthorityOwedPresentations),
    ).toEqual([{ listedAt: AT }]);
  });

  it("replaces the previous list instead of adding to it", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4], AT);

    await list().replace([AUGUST_SECOND_HALF_AT_9], LATER);

    expect(await list().listed()).toEqual([AUGUST_SECOND_HALF_AT_9]);
  });

  it("empties the list when the tax authority lists nothing", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4], AT);

    await list().replace([], LATER);

    expect(await list().listed()).toEqual([]);
  });

  it("records a presentation named twice once", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4, SEPTEMBER_FIRST_HALF_AT_4], AT);

    expect(await list().listed()).toEqual([SEPTEMBER_FIRST_HALF_AT_4]);
  });

  it("keeps the previous list when the new one cannot be recorded in full", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4], AT);
    const unrecordable = { ...AUGUST_SECOND_HALF_AT_9, pointOfSaleNumber: 2 ** 40 };

    await expect(list().replace([AUGUST_SECOND_HALF_AT_9, unrecordable], LATER)).rejects.toThrow();

    expect(await list().listed()).toEqual([SEPTEMBER_FIRST_HALF_AT_4]);
  });

  it("resolves only the presentation it is given", async () => {
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4, AUGUST_SECOND_HALF_AT_9], AT);

    await list().resolve(SEPTEMBER_FIRST_HALF_AT_4, LATER);

    expect(await list().listed()).toEqual([AUGUST_SECOND_HALF_AT_9]);
  });

  it("resolves the same fortnight of one point of sale without touching another's", async () => {
    const sameFortnightAt9 = { ...SEPTEMBER_FIRST_HALF_AT_4, pointOfSaleNumber: 9 };
    await list().replace([SEPTEMBER_FIRST_HALF_AT_4, sameFortnightAt9], AT);

    await list().resolve(SEPTEMBER_FIRST_HALF_AT_4, LATER);

    expect(await list().listed()).toEqual([sameFortnightAt9]);
  });

  it("resolves a presentation that is not listed without failing", async () => {
    await list().resolve(SEPTEMBER_FIRST_HALF_AT_4, LATER);

    expect(await list().listed()).toEqual([]);
  });
});
