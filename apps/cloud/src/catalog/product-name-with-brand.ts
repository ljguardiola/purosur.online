import { type SQL, sql } from "drizzle-orm";
import { brands, products } from "../platform/db/schema.js";

export function productNameWithBrand(): SQL {
  return sql`concat_ws(' ', ${products.name}, ${brands.name})`;
}
