import { describe, expect, it } from "vitest";
import { editIssuerIdentification } from "./edit-issuer-identification.js";
import { FakeIssuerIdentificationStore } from "./test-support/fake-issuer-identification-store.js";

const saved = {
  legalName: "Comercio de Prueba",
  grossIncomeRegistration: "CM 000-000000-0",
  activityStartDate: "2020-01-15",
  authorizedCuit: "20-00000000-1",
  version: 3,
};

function edit(store: FakeIssuerIdentificationStore, overrides: Record<string, unknown> = {}) {
  return editIssuerIdentification(
    { store },
    {
      legalName: "Comercio de Prueba Nuevo",
      grossIncomeRegistration: "CM 000-000000-0",
      activityStartDate: "2020-01-15",
      authorizedCuit: "20-00000000-1",
      version: 3,
      actorId: "actor-1",
      ...overrides,
    },
  );
}

describe("editIssuerIdentification", () => {
  it("records the edit as the next version, under the CUIT it was saved with and who saved it", async () => {
    const store = new FakeIssuerIdentificationStore(saved);

    const outcome = await edit(store);

    const next = {
      legalName: "Comercio de Prueba Nuevo",
      grossIncomeRegistration: "CM 000-000000-0",
      activityStartDate: "2020-01-15",
      authorizedCuit: "20-00000000-1",
      version: 4,
    };
    expect(outcome).toEqual({ kind: "edited", identification: next });
    expect(store.snapshot()).toEqual({
      current: next,
      versions: [{ ...next, recordedBy: "actor-1", previous: saved }],
    });
  });

  it("refuses an edit made from another version, writing nothing", async () => {
    const store = new FakeIssuerIdentificationStore(saved);
    const before = store.snapshot();

    const outcome = await edit(store, { version: 2 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentIssuerIdentification"]);
  });

  it("records nothing when every value is the one already saved", async () => {
    const store = new FakeIssuerIdentificationStore(saved);
    const before = store.snapshot();

    const outcome = await edit(store, { legalName: "Comercio de Prueba" });

    expect(outcome).toEqual({ kind: "unchanged", identification: saved });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentIssuerIdentification"]);
  });

  it.each([
    ["the legal name", { legalName: "Otro Comercio de Prueba" }],
    ["the gross-income registration", { grossIncomeRegistration: "CM 000-000000-1" }],
    ["the activity start date", { activityStartDate: "2020-01-16" }],
    ["the CUIT", { authorizedCuit: "20-11111111-2" }],
  ])("records a new version when only %s differs", async (_case, change) => {
    const store = new FakeIssuerIdentificationStore(saved);

    const outcome = await edit(store, { legalName: "Comercio de Prueba", ...change });

    expect(outcome).toEqual({
      kind: "edited",
      identification: { ...saved, ...change, version: 4 },
    });
  });

  it("records the first edit of an identification kept without a CUIT", async () => {
    const store = new FakeIssuerIdentificationStore({ ...saved, authorizedCuit: null });

    const outcome = await edit(store, { legalName: "Comercio de Prueba" });

    expect(outcome).toEqual({ kind: "edited", identification: { ...saved, version: 4 } });
  });

  it("reads the current identification before it records, in one transaction", async () => {
    const store = new FakeIssuerIdentificationStore(saved);

    await edit(store);

    expect(store.operationOrder).toEqual([
      "lockCurrentIssuerIdentification",
      "recordIssuerIdentificationVersion",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
