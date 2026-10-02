import { describe, expect, it } from "vitest";
import { authorizersOf } from "./authorizers";

const PEOPLE = [
  {
    id: "u1",
    firstName: "Ada",
    access: { isAdministrator: false, permissionKeys: ["record_cash_in"] },
  },
  {
    id: "u2",
    firstName: "Bruno",
    access: { isAdministrator: false, permissionKeys: ["close_anothers_register_session"] },
  },
];

describe("the authorizers of a register", () => {
  it("lists the people who hold a permission by id and first name", () => {
    expect(
      authorizersOf(
        { signablePeople: () => PEOPLE },
        { kind: "permission", permission: "record_cash_in" },
      ),
    ).toEqual([{ id: "u1", first_name: "Ada" }]);
  });

  it("lists the people who may authorize an operation by id and first name", () => {
    expect(
      authorizersOf(
        { signablePeople: () => PEOPLE },
        {
          kind: "operation",
          operation: { kind: "close_locked_register", session: { openedBy: "u1" } },
        },
      ),
    ).toEqual([{ id: "u2", first_name: "Bruno" }]);
  });
});
