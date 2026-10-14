import type { OfflineDocumentsOfFortnight } from "@purosur/domain/fiscal/use-cases";
import { expect, it } from "vitest";
import { NoOfflineDocumentsYet } from "./no-offline-documents-yet.js";

it("counts no document under any fortnight's offline code, since no register issues them yet", async () => {
  const documents: OfflineDocumentsOfFortnight = new NoOfflineDocumentsYet();

  expect(await documents.countOn(8, { start: "2026-10-01", end: "2026-10-15" })).toBe(0);
});
