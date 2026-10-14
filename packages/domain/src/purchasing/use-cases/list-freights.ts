import type { FreightListing, FreightListQuery, FreightListReader } from "./freight-list-reader.js";

export interface ListedFreights {
  items: FreightListing[];
  count: number;
  totalCents: number;
}

export async function listFreights(
  reader: FreightListReader,
  query: FreightListQuery,
): Promise<ListedFreights> {
  const items = await reader.freights(query);
  return {
    items,
    count: items.length,
    totalCents: items.reduce((sum, { amountCents }) => sum + amountCents, 0),
  };
}
