import { describe, expect, it } from "vitest";
import { recordAuthorizedCuit } from "./record-authorized-cuit.js";
import { FakeIssuerIdentificationStore } from "./test-support/fake-issuer-identification-store.js";

const saved = {
  legalName: "Comercio de Prueba",
  grossIncomeRegistration: "CM 000-000000-0",
  activityStartDate: "2020-01-15",
  authorizedCuit: "20-00000000-1",
  version: 3,
};

describe("recordAuthorizedCuit", () => {
  it("records nothing when the identification is already under that CUIT", async () => {
    const store = new FakeIssuerIdentificationStore(saved);
    const before = store.snapshot();

    const outcome = await recordAuthorizedCuit({ store }, { authorizedCuit: "20-00000000-1" });

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentIssuerIdentification"]);
  });

  it.each([
    ["another CUIT", "20-00000000-1"],
    ["no CUIT", null],
  ])(
    "records a new version keeping every other value when the identification is under %s",
    async (_case, previousCuit) => {
      const previous = { ...saved, authorizedCuit: previousCuit };
      const store = new FakeIssuerIdentificationStore(previous);

      const outcome = await recordAuthorizedCuit({ store }, { authorizedCuit: "20-11111111-2" });

      const next = { ...saved, authorizedCuit: "20-11111111-2", version: 4 };
      expect(outcome).toEqual({ kind: "recorded", version: 4 });
      expect(store.snapshot()).toEqual({
        current: next,
        versions: [{ ...next, recordedBy: null, previous }],
      });
    },
  );

  it("reads the current identification before it records, in one transaction", async () => {
    const store = new FakeIssuerIdentificationStore(saved);

    await recordAuthorizedCuit({ store }, { authorizedCuit: "20-11111111-2" });

    expect(store.operationOrder).toEqual([
      "lockCurrentIssuerIdentification",
      "recordIssuerIdentificationVersion",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
