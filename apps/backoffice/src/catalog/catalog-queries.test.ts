import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { catalogKey, catalogKeys } from "./catalog-queries";

test("invalidating the catalog key marks every catalog list stale, whatever its filter", async () => {
  const client = new QueryClient();
  const keys = [
    catalogKeys.categories,
    catalogKeys.brands,
    catalogKeys.products("active"),
    catalogKeys.products("inactive"),
    catalogKeys.products("all"),
  ];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["other"], []);

  await client.invalidateQueries({ queryKey: catalogKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);
});

test("each product status has its own key, so one status's late answer cannot land in another's list", () => {
  expect(catalogKeys.products("active")).not.toEqual(catalogKeys.products("inactive"));
  expect(catalogKeys.products("active")).not.toEqual(catalogKeys.categories);
});
