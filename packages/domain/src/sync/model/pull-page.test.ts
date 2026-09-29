import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FIRST_PULL_CURSOR,
  isPageAfter,
  isPullCursor,
  PULL_PAGE_MAX_CHANGES,
  PULL_PAGE_READ_LIMIT,
  pullPageOf,
} from "./pull-page.js";

function changesFrom(firstSeq: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({ changeSeq: firstSeq + index }));
}

describe("the pull cursor", () => {
  it("starts a brand-new installation at zero", () => {
    expect(FIRST_PULL_CURSOR).toBe(0);
  });

  it.each([0, 1, 500, Number.MAX_SAFE_INTEGER])("accepts %s", (value) => {
    expect(isPullCursor(value)).toBe(true);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s",
    (value) => {
      expect(isPullCursor(value)).toBe(false);
    },
  );
});

describe("a pull page", () => {
  it("never carries more than 500 changes, reading one more to learn whether others wait", () => {
    expect(PULL_PAGE_MAX_CHANGES).toBe(500);
    expect(PULL_PAGE_READ_LIMIT).toBe(501);
  });

  it("carries every change when no more than 500 wait, with the cursor of the last one", () => {
    const page = pullPageOf(7, changesFrom(8, 500));

    expect(page.changes).toEqual(changesFrom(8, 500));
    expect(page.cursor).toBe(507);
    expect(page.hasMore).toBe(false);
  });

  it("carries the first 500 changes and says more wait when more than 500 do", () => {
    const page = pullPageOf(7, changesFrom(8, 501));

    expect(page.changes).toEqual(changesFrom(8, 500));
    expect(page.cursor).toBe(507);
    expect(page.hasMore).toBe(true);
  });

  it("keeps the cursor it was asked from when no change waits", () => {
    expect(pullPageOf(42, [])).toEqual({ changes: [], cursor: 42, hasMore: false });
  });

  it("always follows the cursor it was asked from", () => {
    fc.assert(
      fc.property(fc.nat(1_000_000), fc.nat(PULL_PAGE_READ_LIMIT), (since, count) => {
        expect(isPageAfter(since, pullPageOf(since, changesFrom(since + 1, count)))).toBe(true);
      }),
    );
  });
});

describe("whether a page follows a cursor", () => {
  it("accepts a page whose changes come after the cursor in order, ending at its own cursor", () => {
    expect(isPageAfter(3, { changes: changesFrom(4, 3), cursor: 6, hasMore: true })).toBe(true);
  });

  it("accepts an empty last page that keeps the cursor", () => {
    expect(isPageAfter(3, { changes: [], cursor: 3, hasMore: false })).toBe(true);
  });

  it.each([
    ["an empty page that moves the cursor", { changes: [], cursor: 4, hasMore: false }],
    ["an empty page that says more wait", { changes: [], cursor: 3, hasMore: true }],
    [
      "a change already behind the cursor",
      { changes: [{ changeSeq: 3 }, { changeSeq: 4 }], cursor: 4, hasMore: false },
    ],
    [
      "changes out of order",
      { changes: [{ changeSeq: 5 }, { changeSeq: 4 }], cursor: 4, hasMore: false },
    ],
    [
      "the same change twice",
      { changes: [{ changeSeq: 4 }, { changeSeq: 4 }], cursor: 4, hasMore: false },
    ],
    [
      "a cursor that is not its last change",
      { changes: [{ changeSeq: 4 }, { changeSeq: 5 }], cursor: 6, hasMore: false },
    ],
    ["more than 500 changes", { changes: changesFrom(4, 501), cursor: 504, hasMore: false }],
  ])("refuses %s", (_case, page) => {
    expect(isPageAfter(3, page)).toBe(false);
  });

  it("accepts exactly 500 changes", () => {
    expect(isPageAfter(3, { changes: changesFrom(4, 500), cursor: 503, hasMore: false })).toBe(
      true,
    );
  });
});
