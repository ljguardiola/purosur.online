import { desc } from "drizzle-orm";
import { prices } from "../platform/db/schema.js";

export const NEWEST_PRICE_FIRST = [desc(prices.validFrom), desc(prices.id)] as const;
