import { describe, expect, it } from "vitest";
import { currentFortnightCodeAfterObtaining } from "./current-fortnight-code-after-obtaining.js";
import type {
  FortnightAcquisitionOutcome,
  ObtainOfflineAuthorizationCodesOutcome,
} from "./obtain-offline-authorization-codes.js";

const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const SOME_DAY_OF_FIRST_HALF = "2026-10-10";

function attempted(
  ...fortnights: { fortnight: typeof FIRST_HALF; outcome: FortnightAcquisitionOutcome }[]
): ObtainOfflineAuthorizationCodesOutcome {
  return { kind: "attempted", fortnights };
}

describe("currentFortnightCodeAfterObtaining", () => {
  it.each([
    "obtained",
    "recovered",
    "held",
  ] as const)("is held when the current fortnight's code was %s", (kind) => {
    expect(
      currentFortnightCodeAfterObtaining(
        attempted({ fortnight: FIRST_HALF, outcome: { kind } }),
        SOME_DAY_OF_FIRST_HALF,
      ),
    ).toBe("held");
  });

  it.each([
    { kind: "no_token" },
    { kind: "refused", rejections: [] },
    { kind: "no_answer" },
    { kind: "not_recovered" },
    { kind: "unexpected_fortnight" },
  ] as const)("is missing when the current fortnight's outcome was $kind", (outcome) => {
    expect(
      currentFortnightCodeAfterObtaining(
        attempted({ fortnight: FIRST_HALF, outcome }),
        SOME_DAY_OF_FIRST_HALF,
      ),
    ).toBe("missing");
  });

  it("looks only at the fortnight containing the day, not at the next one", () => {
    expect(
      currentFortnightCodeAfterObtaining(
        attempted(
          { fortnight: FIRST_HALF, outcome: { kind: "no_answer" } },
          { fortnight: SECOND_HALF, outcome: { kind: "obtained" } },
        ),
        SOME_DAY_OF_FIRST_HALF,
      ),
    ).toBe("missing");
    expect(
      currentFortnightCodeAfterObtaining(
        attempted(
          { fortnight: FIRST_HALF, outcome: { kind: "obtained" } },
          { fortnight: SECOND_HALF, outcome: { kind: "no_answer" } },
        ),
        SOME_DAY_OF_FIRST_HALF,
      ),
    ).toBe("held");
  });

  it("is missing when the run did not try the current fortnight", () => {
    expect(
      currentFortnightCodeAfterObtaining(attempted(), SOME_DAY_OF_FIRST_HALF),
    ).toBe("missing");
  });

  it("has nothing to obtain when the cloud has no offline point of sale", () => {
    expect(
      currentFortnightCodeAfterObtaining(
        { kind: "no_offline_point_of_sale" },
        SOME_DAY_OF_FIRST_HALF,
      ),
    ).toBe("nothing_to_obtain");
  });
});
