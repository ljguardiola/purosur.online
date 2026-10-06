import { categories, discounts } from "../../platform/db/schema.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";

type Db = TestDatabase["db"];

export const OTHER_PERMISSIONS_THAN_PROMOTIONS = [
  ["sell_and_charge"],
  ["manage_products_and_categories"],
  ["manage_prices_and_review"],
] as const;

export async function insertCategory(db: Db, name: string): Promise<string> {
  const [category] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function insertDiscount(
  db: Db,
  input: {
    now: Date;
    categoryId?: string;
    productId?: string;
    tagId?: string;
    name?: string;
    kind?: "PERCENT_OFF" | "BUY_N_PAY_M";
    percent?: number | null;
    buyQty?: number;
    payQty?: number;
    validFrom?: string;
    validTo?: string;
    weekdays?: number[];
    active?: boolean;
    version?: number;
  },
): Promise<{ id: string; version: number }> {
  const { now, ...discountInput } = input;
  const [discount] = await db
    .insert(discounts)
    .values({
      name: "Semana de los frutos secos",
      kind: "PERCENT_OFF",
      percent: 15,
      validFrom: isoDate(daysAfter(now, 1)),
      validTo: isoDate(daysAfter(now, 31)),
      ...discountInput,
    })
    .returning({ id: discounts.id, version: discounts.version });
  if (!discount) {
    throw new Error("test setup: seeding the discount returned no row");
  }
  return discount;
}
