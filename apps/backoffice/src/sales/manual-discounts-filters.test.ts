import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { manualDiscountsFilters, manualDiscountsQueryOf } from "./manual-discounts-filters";
import { ANA_USER_ID } from "./test-support/sales-fixtures";

test("opens on no range, every register and everyone who authorized", () => {
  expect(manualDiscountsFilters.parse({})).toEqual({
    from: "",
    to: "",
    register: "ALL",
    authorizedBy: "ALL",
  });
});

test("keeps the range, the register and the authorizer a URL names", () => {
  const filters = {
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    authorizedBy: ANA_USER_ID,
  };

  expect(manualDiscountsFilters.parse(filters)).toEqual(filters);
});

test("falls back to no range for one the cloud would refuse, keeping the rest", () => {
  const parsed = manualDiscountsFilters.parse({
    from: "2026-10-08",
    to: "2026-10-07",
    authorizedBy: ANA_USER_ID,
  });

  expect(parsed).toMatchObject({ from: "", to: "", authorizedBy: ANA_USER_ID });
});

test.each([
  ["a name", "Ana"],
  ["an empty value", ""],
  ["something that is not text", 3],
])("falls back to everyone for an authorizer that is %s", (_name, authorizedBy) => {
  expect(manualDiscountsFilters.parse({ authorizedBy })).toMatchObject({ authorizedBy: "ALL" });
});

test("asks the cloud for nothing when nothing is chosen", () => {
  expect(manualDiscountsQueryOf(manualDiscountsFilters.parse({}))).toEqual({});
});

test("asks the cloud for the range, the register and the authorizer chosen", () => {
  const filters = manualDiscountsFilters.parse({
    from: "2026-10-01",
    to: "2026-10-07",
    register: FRONT_REGISTER_ID,
    authorizedBy: ANA_USER_ID,
  });

  expect(manualDiscountsQueryOf(filters)).toEqual({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
    authorized_by: ANA_USER_ID,
  });
});
