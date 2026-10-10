import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { purchasingKey, purchasingKeys } from "./purchasing-queries";

test("invalidating the purchasing key marks the suppliers, the packagings and the purchases stale", async () => {
  const client = new QueryClient();
  const keys = [purchasingKeys.suppliers, purchasingKeys.packagings, purchasingKeys.purchases];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["other"], []);

  await client.invalidateQueries({ queryKey: purchasingKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);
});

test("the suppliers, the packagings and the purchases have different keys", () => {
  expect(purchasingKeys.suppliers).not.toEqual(purchasingKeys.packagings);
  expect(purchasingKeys.purchases).not.toEqual(purchasingKeys.packagings);
  expect(purchasingKeys.purchases).not.toEqual(purchasingKeys.suppliers);
});
