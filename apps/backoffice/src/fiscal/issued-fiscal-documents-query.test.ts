import { expect, test } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { issuedFiscalDocumentsFilters } from "./issued-fiscal-documents-filters";
import { issuedFiscalDocumentsQueryOf } from "./issued-fiscal-documents-query";

test("asks the cloud for nothing but the page when the filters are the defaults", () => {
  expect(issuedFiscalDocumentsQueryOf(issuedFiscalDocumentsFilters.parse({}))).toEqual({
    page: 1,
  });
});

test("asks the cloud for every filter the URL carries", () => {
  const filters = issuedFiscalDocumentsFilters.parse({
    from: "2026-09-01",
    to: "2026-09-30",
    register: FRONT_REGISTER_ID,
    kind: "receipt",
    number: "1247",
    page: "2",
  });

  expect(issuedFiscalDocumentsQueryOf(filters)).toEqual({
    from: "2026-09-01",
    to: "2026-09-30",
    register_id: FRONT_REGISTER_ID,
    kind: "receipt",
    number: 1247,
    page: 2,
  });
});

test.each(["abc", "0041", "12a"])(
  "asks the cloud for no number when the URL carries %s",
  (number) => {
    const filters = issuedFiscalDocumentsFilters.parse({ number });

    expect(issuedFiscalDocumentsQueryOf(filters)).toEqual({ page: 1 });
  },
);
