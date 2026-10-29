import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { containsPattern, containsText } from "./contains-pattern.js";
import { brands } from "./db/schema.js";

describe("containsPattern", () => {
  it("matches the text anywhere", () => {
    expect(containsPattern("yerba")).toBe("%yerba%");
  });

  it("matches the pattern's own characters literally", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("containsText", () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
  });

  async function namesContaining(text: string, names: readonly string[]): Promise<string[]> {
    await testDatabase.db.insert(brands).values(names.map((name) => ({ name })));
    const rows = await testDatabase.db
      .select({ name: brands.name })
      .from(brands)
      .where(containsText(brands.name, text));
    return rows.map((row) => row.name).sort();
  }

  it("finds stored accents from text typed without them, whatever the case", async () => {
    expect(await namesContaining("cafe NANDU", ["Café Ñandú", "Té del Sur"])).toEqual([
      "Café Ñandú",
    ]);
  });

  it("finds text stored without accents from text typed with them, whatever the case", async () => {
    expect(await namesContaining("CAFÉ", ["cafe tostado", "Té del Sur"])).toEqual(["cafe tostado"]);
  });

  it("folds letters that carry no separable accent", async () => {
    expect(await namesContaining("smorrebrod lodz", ["Smørrebrød Łódź", "Té del Sur"])).toEqual([
      "Smørrebrød Łódź",
    ]);
  });

  it("reads the pattern's own characters literally", async () => {
    expect(
      await namesContaining("50%_á\\", ["50%_a\\ off", "500 a off", "50%xa\\ off", "50%_a off"]),
    ).toEqual(["50%_a\\ off"]);
  });
});
