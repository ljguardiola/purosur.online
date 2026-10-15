import { describe, expect, it } from "vitest";
import {
  fiscalCoreToRendererMessageSchema,
  fiscalRendererToCoreMessageSchema,
} from "./clock-guard-core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

function acceptsRequest(message: unknown): boolean {
  return fiscalRendererToCoreMessageSchema.safeParse(message).success;
}

function acceptsAnswer(type: string, outcome: unknown): boolean {
  return fiscalCoreToRendererMessageSchema.safeParse({
    type,
    request_id: REQUEST_ID,
    outcome,
  }).success;
}

const BLOCK = {
  point_of_sale: 12,
  document_type: "factura_c",
  latest_reading: "2026-10-01T16:00:00.000Z",
  tax_authority_last_authorized_issued_on: "2026-10-01",
};

const READ = {
  kind: "read",
  reading: "2026-10-01T15:00:00.000Z",
  blocks: [BLOCK],
  may_correct: true,
  correction_available: true,
};

const LOWERING = {
  point_of_sale: 12,
  document_type: "factura_c",
  previous_reading: "2026-10-01T16:00:00.000Z",
  corrected_reading: "2026-10-01T15:00:00.000Z",
};

describe("fiscalRendererToCoreMessageSchema", () => {
  it("rejects any other message type", () => {
    expect(acceptsRequest({ type: "health-check" })).toBe(false);
    expect(acceptsRequest({})).toBe(false);
  });

  it.each(["read-clock-guard", "correct-register-clock"])("accepts %s", (type) => {
    expect(fiscalRendererToCoreMessageSchema.parse({ type, request_id: REQUEST_ID })).toEqual({
      type,
      request_id: REQUEST_ID,
    });
  });

  it.each(["read-clock-guard", "correct-register-clock"])(
    "rejects %s without a request id",
    (type) => {
      expect(acceptsRequest({ type })).toBe(false);
    },
  );
});

describe("fiscalCoreToRendererMessageSchema", () => {
  it("rejects any other message type", () => {
    expect(acceptsAnswer("health-check-result", { kind: "unavailable" })).toBe(false);
  });

  describe("read-clock-guard-result", () => {
    const accepts = (outcome: unknown) => acceptsAnswer("read-clock-guard-result", outcome);

    it("accepts the guard read with the blocks of the series the clock holds back", () => {
      expect(accepts(READ)).toBe(true);
    });

    it("accepts a read with no block", () => {
      expect(accepts({ ...READ, blocks: [], correction_available: false })).toBe(true);
    });

    it("accepts a block with neither a mark nor a tax authority day", () => {
      const block = {
        ...BLOCK,
        latest_reading: null,
        tax_authority_last_authorized_issued_on: null,
      };

      expect(accepts({ ...READ, blocks: [block] })).toBe(true);
    });

    it("accepts the guard being unavailable", () => {
      expect(accepts({ kind: "unavailable" })).toBe(true);
    });

    it.each([
      ["a reading that is not an instant", { ...READ, reading: "yesterday" }],
      ["no reading", { ...READ, reading: undefined }],
      ["a block without a point of sale", { ...READ, blocks: [{ ...BLOCK, point_of_sale: 0 }] }],
      [
        "a block of another document type",
        { ...READ, blocks: [{ ...BLOCK, document_type: "factura_a" }] },
      ],
      [
        "a block whose mark is not an instant",
        { ...READ, blocks: [{ ...BLOCK, latest_reading: "late" }] },
      ],
      ["no permission answer", { ...READ, may_correct: undefined }],
      ["no availability answer", { ...READ, correction_available: undefined }],
      ["an outcome of another operation", { kind: "corrected", lowerings: [LOWERING] }],
    ])("rejects %s", (_case, outcome) => {
      expect(accepts(outcome)).toBe(false);
    });
  });

  describe("correct-register-clock-result", () => {
    const accepts = (outcome: unknown) => acceptsAnswer("correct-register-clock-result", outcome);

    it("accepts a correction with each lowering of a mark", () => {
      expect(
        accepts({ kind: "corrected", lowerings: [LOWERING, { ...LOWERING, point_of_sale: 7 }] }),
      ).toBe(true);
    });

    it.each([
      "not_signed_in",
      "not_permitted",
      "not_behind",
      "already_corrected_in_period",
      "unavailable",
    ])("accepts %s", (kind) => {
      expect(accepts({ kind })).toBe(true);
    });

    it.each([
      ["another outcome", { kind: "lacks_permission" }],
      ["a correction with no lowering", { kind: "corrected", lowerings: [] }],
      [
        "a lowering whose readings are not instants",
        { kind: "corrected", lowerings: [{ ...LOWERING, corrected_reading: "now" }] },
      ],
      ["a correction without its lowerings", { kind: "corrected" }],
    ])("rejects %s", (_case, outcome) => {
      expect(accepts(outcome)).toBe(false);
    });
  });
});
