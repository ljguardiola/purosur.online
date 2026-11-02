import { describe, expect, it } from "vitest";
import { backofficeSources } from "./test-support/backoffice-sources";

describe("the generic retry advice of a failure", () => {
  it("is written only where a release-aware failure owns it", () => {
    const writingIt = backofficeSources()
      .filter(
        ({ path, text }) =>
          path !== "platform/action-failure-notice.tsx" && /probá de nuevo/i.test(text),
      )
      .map(({ path }) => path);

    expect(writingIt).toEqual([]);
  });
});
