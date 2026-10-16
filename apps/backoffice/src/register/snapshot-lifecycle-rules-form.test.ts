import { snapshotLifecycleRulesSchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_SNAPSHOT_LIFECYCLE_RULES_FORM,
  SNAPSHOT_LIFECYCLE_RULES_MESSAGES,
  snapshotLifecycleRangeHint,
  snapshotLifecycleRulesFormValuesFrom,
  snapshotLifecycleRulesRequestFrom,
} from "./snapshot-lifecycle-rules-form";

test("fills the form with the rules in force", () => {
  expect(snapshotLifecycleRulesFormValuesFrom({ hourly: 24, daily: 30, monthly: 12 })).toEqual({
    hourly: "24",
    daily: "30",
    monthly: "12",
  });
});

test("starts empty", () => {
  expect(EMPTY_SNAPSHOT_LIFECYCLE_RULES_FORM).toEqual({ hourly: "", daily: "", monthly: "" });
});

test("builds the request with the typed whole numbers", () => {
  const request = snapshotLifecycleRulesRequestFrom({ hourly: " 48 ", daily: "60", monthly: "6" });

  expect(request).toEqual({ hourly: 48, daily: 60, monthly: 6 });
  expect(snapshotLifecycleRulesSchema.safeParse(request).success).toBe(true);
});

test.each(["", "abc", "1.5", "-3", "2e1", "1,5"])(
  "a typed %j is refused by the request's shape",
  (typed) => {
    expect(
      snapshotLifecycleRulesSchema.safeParse(
        snapshotLifecycleRulesRequestFrom({ hourly: typed, daily: "30", monthly: "12" }),
      ).success,
    ).toBe(false);
  },
);

test("describes the range each tier accepts from the request's shape", () => {
  expect(snapshotLifecycleRangeHint("hourly")).toBe("Entre 1 y 72");
  expect(snapshotLifecycleRangeHint("daily")).toBe("Entre 1 y 90");
  expect(snapshotLifecycleRangeHint("monthly")).toBe("Entre 1 y 24");
});

test("asks for a whole number inside each tier's range", () => {
  expect(SNAPSHOT_LIFECYCLE_RULES_MESSAGES.hourly()).toBe("Ingresá un número entero entre 1 y 72.");
  expect(SNAPSHOT_LIFECYCLE_RULES_MESSAGES.daily()).toBe("Ingresá un número entero entre 1 y 90.");
  expect(SNAPSHOT_LIFECYCLE_RULES_MESSAGES.monthly()).toBe(
    "Ingresá un número entero entre 1 y 24.",
  );
});
