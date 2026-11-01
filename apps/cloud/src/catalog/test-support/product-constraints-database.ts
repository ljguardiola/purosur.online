import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories } from "../../platform/db/schema.js";
import { createIntegrationDatabase } from "../../test-support/integration-database.js";

export interface ProductConstraintsDatabase {
  db: PostgresJsDatabase<Record<string, never>>;
  categoryId: string;
  close(): Promise<void>;
}

export async function openProductConstraintsDatabase(
  namePrefix: string,
): Promise<ProductConstraintsDatabase> {
  const integrationDb = await createIntegrationDatabase(namePrefix);
  const sql = postgres(integrationDb.databaseUrl, { max: 1 });
  const db = drizzle(sql);
  const [category] = await db
    .insert(categories)
    .values({ name: `Macetas ${randomUUID()}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return {
    db,
    categoryId: category.id,
    async close() {
      await sql.end({ timeout: 1 });
      await integrationDb.close();
    },
  };
}
