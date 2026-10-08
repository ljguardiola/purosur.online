import { expect, test } from "vitest";
import { passkeyListFromWire } from "./passkey-list";

test("reads each passkey of the list with its dates in camel case", () => {
  expect(
    passkeyListFromWire([
      {
        id: "pk-1",
        name: "Notebook del local",
        created_at: "2026-08-02T12:00:00.000Z",
        last_used_at: null,
      },
      {
        id: "pk-2",
        name: "Teléfono de Lucía",
        created_at: "2026-08-03T12:00:00.000Z",
        last_used_at: "2026-09-23T09:12:00.000Z",
      },
    ]),
  ).toEqual([
    {
      id: "pk-1",
      name: "Notebook del local",
      createdAt: "2026-08-02T12:00:00.000Z",
      lastUsedAt: null,
    },
    {
      id: "pk-2",
      name: "Teléfono de Lucía",
      createdAt: "2026-08-03T12:00:00.000Z",
      lastUsedAt: "2026-09-23T09:12:00.000Z",
    },
  ]);
});

test("reads an empty list as no passkeys", () => {
  expect(passkeyListFromWire([])).toEqual([]);
});

test("refuses a body that is not a passkey list", () => {
  expect(passkeyListFromWire([{ id: "pk-1", name: "Notebook del local" }])).toBeUndefined();
  expect(passkeyListFromWire({ passkeys: [] })).toBeUndefined();
});
