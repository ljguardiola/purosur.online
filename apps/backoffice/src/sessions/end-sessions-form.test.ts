import { compromiseResponseSessionsAndPasskeysBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  accountOptions,
  EMPTY_VALUES,
  MESSAGES,
  REQUEST_FIELDS,
  requestFrom,
} from "./end-sessions-form";
import { ACCOUNT_ID } from "./test-support/compromise-response";

test("builds the request from the chosen account", () => {
  expect(requestFrom({ accountId: ACCOUNT_ID })).toEqual({ account_id: ACCOUNT_ID });
});

test("an empty form does not satisfy the request's shape, and a chosen account does", () => {
  const empty = compromiseResponseSessionsAndPasskeysBodySchema.safeParse(
    requestFrom(EMPTY_VALUES),
  );
  const chosen = compromiseResponseSessionsAndPasskeysBodySchema.safeParse(
    requestFrom({ accountId: ACCOUNT_ID }),
  );

  expect(empty.success).toBe(false);
  expect(chosen.success).toBe(true);
});

test("lands a problem with the request's account on the account field with a message to choose one", () => {
  expect(REQUEST_FIELDS.account_id).toBe("accountId");
  expect(MESSAGES.accountId).toBe("Elegí una cuenta.");
});

test("offers each account by name and email", () => {
  expect(
    accountOptions([
      { id: ACCOUNT_ID, firstName: "Ana Pérez", email: "ana@example.com" },
      { id: "b", firstName: "Beto Ruiz", email: "beto@example.com" },
    ]),
  ).toEqual([
    { value: ACCOUNT_ID, label: "Ana Pérez · ana@example.com" },
    { value: "b", label: "Beto Ruiz · beto@example.com" },
  ]);
});

test("offers nothing when there is no account", () => {
  expect(accountOptions([])).toBeUndefined();
});
