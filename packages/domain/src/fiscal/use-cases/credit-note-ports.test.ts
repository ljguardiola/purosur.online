import { describe, expectTypeOf, it } from "vitest";
import type {
  ExternalInvoicingRegularization,
  OrphanRegularization,
} from "../model/orphan-authorization.js";
import type { CreditNoteLane } from "./credit-note-ports.js";

type RecordedWithRelease = Parameters<CreditNoteLane["releaseCreditNoteRequest"]>[1];

describe("releasing a credit note request", () => {
  it("records with it invoicing outside the register, or nothing", () => {
    expectTypeOf<ExternalInvoicingRegularization | null>().toExtend<RecordedWithRelease>();
  });

  it("never records with it another credit note", () => {
    expectTypeOf<
      Extract<OrphanRegularization, { kind: "credit_note" }>
    >().not.toExtend<RecordedWithRelease>();
  });
});
