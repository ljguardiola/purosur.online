import { describe, expectTypeOf, it } from "vitest";
import type { LoggedChange } from "./change-log.js";

describe("a logged change", () => {
  it("names the branch a user's change belongs to", () => {
    expectTypeOf<{
      entity: "user";
      entityId: string;
      version: number;
      op: "update";
    }>().not.toExtend<LoggedChange>();
    expectTypeOf<{
      entity: "user";
      entityId: string;
      version: number;
      op: "update";
      locationId: string;
    }>().toExtend<LoggedChange>();
  });

  it("names no branch for the change of anything but a user", () => {
    expectTypeOf<{
      entity: "role";
      entityId: string;
      version: number;
      op: "update";
      locationId: string;
    }>().not.toExtend<LoggedChange>();
    expectTypeOf<{
      entity: "role";
      entityId: string;
      version: number;
      op: "update";
    }>().toExtend<LoggedChange>();
  });

  it("scopes a register's change by the register alone, naming no branch", () => {
    expectTypeOf<{
      entity: "register";
      entityId: string;
      version: number;
      op: "update";
    }>().toExtend<LoggedChange>();
    expectTypeOf<{
      entity: "register";
      entityId: string;
      version: number;
      op: "update";
      locationId: string;
    }>().not.toExtend<LoggedChange>();
  });
});
