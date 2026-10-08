import { describe, expect, it } from "vitest";
import { ERROR_REPORT_DATA_COLLECTION } from "./error-report-data-collection.js";

describe("ERROR_REPORT_DATA_COLLECTION", () => {
  it("collects nothing from any category", () => {
    expect(ERROR_REPORT_DATA_COLLECTION).toStrictEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
    });
  });
});
