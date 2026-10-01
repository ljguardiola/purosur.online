import { describe, expect, it } from "vitest";
import {
  ANOTHER_FICTIONAL_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { recordAuthorizedCuit } from "./record-authorized-cuit.js";
import { FakeIssuerIdentificationStore } from "./test-support/fake-issuer-identification-store.js";

const saved = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  version: 3,
};

describe("recordAuthorizedCuit", () => {
  it("records nothing when the identification is already under that CUIT", async () => {
    const store = new FakeIssuerIdentificationStore(saved);
    const before = store.snapshot();

    const outcome = await recordAuthorizedCuit({ store }, { authorizedCuit: FICTIONAL_CUIT });

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentIssuerIdentification"]);
  });

  it.each([
    ["another CUIT", FICTIONAL_CUIT],
    ["no CUIT", null],
  ])(
    "records a new version keeping every other value when the identification is under %s",
    async (_case, previousCuit) => {
      const previous = { ...saved, authorizedCuit: previousCuit };
      const store = new FakeIssuerIdentificationStore(previous);

      const outcome = await recordAuthorizedCuit(
        { store },
        { authorizedCuit: ANOTHER_FICTIONAL_CUIT },
      );

      const next = { ...saved, authorizedCuit: ANOTHER_FICTIONAL_CUIT, version: 4 };
      expect(outcome).toEqual({ kind: "recorded", version: 4 });
      expect(store.snapshot()).toEqual({
        current: next,
        versions: [{ ...next, recordedBy: null, previous }],
      });
    },
  );

  it("reads the current identification before it records, in one transaction", async () => {
    const store = new FakeIssuerIdentificationStore(saved);

    await recordAuthorizedCuit({ store }, { authorizedCuit: ANOTHER_FICTIONAL_CUIT });

    expect(store.operationOrder).toEqual([
      "lockCurrentIssuerIdentification",
      "recordIssuerIdentificationVersion",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
