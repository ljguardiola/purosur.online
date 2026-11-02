import { describe, expect, it } from "vitest";
import { backofficeSources } from "./test-support/backoffice-sources";

const MAY_CALL_FETCH = ["platform/cloud-fetch.ts", "platform/deployed-release-api.ts"];
const GLOBAL_FETCH_CALL = /(?<![\w.])fetch\(|\b(?:window|globalThis)\.fetch\b/;

describe("the backoffice's requests to the cloud", () => {
  it("all go through cloudFetch, so a refusal from an outdated tab is noticed", () => {
    const callingFetch = backofficeSources()
      .filter(({ path, text }) => !MAY_CALL_FETCH.includes(path) && GLOBAL_FETCH_CALL.test(text))
      .map(({ path }) => path);

    expect(callingFetch).toEqual([]);
  });
});
