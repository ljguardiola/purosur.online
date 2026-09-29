import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { registerKey, registerKeys } from "./register-queries";

test("invalidating the register key marks the registers list and their coverage stale and leaves other concepts alone", async () => {
  const client = new QueryClient();
  client.setQueryData(registerKeys.registers, []);
  client.setQueryData(registerKeys.coverage, []);
  client.setQueryData(["catalog", "categories"], []);

  await client.invalidateQueries({ queryKey: registerKey, refetchType: "none" });

  expect(client.getQueryState(registerKeys.registers)?.isInvalidated).toBe(true);
  expect(client.getQueryState(registerKeys.coverage)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["catalog", "categories"])?.isInvalidated).toBe(false);
});
