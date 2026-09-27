import { expect, test } from "vitest";
import { parseSearch, stringifySearch } from "./search-params";

test("reads every URL value as the literal text a person typed", () => {
  expect(
    parseSearch(
      "?search=7790001234567&category=12&flag=true&code=00123&long=123456789012345678901",
    ),
  ).toEqual({
    search: "7790001234567",
    category: "12",
    flag: "true",
    code: "00123",
    long: "123456789012345678901",
  });
});

test("reads a URL without a query as no values", () => {
  expect(parseSearch("")).toEqual({});
});

test("writes each value as its text and leaves out the ones not set", () => {
  expect(stringifySearch({ search: "miel pura", page: 2, level: undefined })).toBe(
    "?search=miel+pura&page=2",
  );
  expect(stringifySearch({})).toBe("");
});

test("reads back the text it writes", () => {
  const search = { search: '"007" & más', category: "12" };
  expect(parseSearch(stringifySearch(search))).toEqual(search);
});
