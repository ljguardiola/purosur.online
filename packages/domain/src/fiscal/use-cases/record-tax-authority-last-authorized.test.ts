import { describe, expect, it } from "vitest";
import type { FiscalTaskDocumentType } from "../model/fiscal-task.js";
import { recordTaxAuthorityLastAuthorized } from "./record-tax-authority-last-authorized.js";
import type { LastAuthorizedAnswer, LastAuthorizedCount } from "./tax-authority-count-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeLastAuthorizedLookup,
  FakeTaxAuthorityCounts,
  FakeVoucherLookup,
} from "./test-support/fake-tax-authority-count.js";
import type { VoucherAnswer } from "./unclear-outcome-ports.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-09-30T12:00:00.000Z");
const VOUCHER: VoucherAnswer = {
  kind: "found",
  voucher: {
    issuedOn: "2026-09-30",
    total: 12_500,
    documentType: 11,
    receiverDocumentType: 99,
    receiverDocumentNumber: 0,
    receiverTaxStatusCode: 5,
    authorizationCode: "71234567890123",
    authorizationCodeDueOn: "2026-10-10",
  },
};
const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

function record({
  token = TOKEN,
  answer = { kind: "read", number: 38 },
  stored = [],
  voucher = VOUCHER,
  documentType = "factura_c",
}: {
  token?: typeof TOKEN | null;
  answer?: LastAuthorizedAnswer;
  stored?: LastAuthorizedCount[];
  voucher?: VoucherAnswer;
  documentType?: FiscalTaskDocumentType;
} = {}) {
  const taxAuthority = new FakeLastAuthorizedLookup(answer);
  const vouchers = new FakeVoucherLookup(voucher);
  const counts = new FakeTaxAuthorityCounts(stored);
  const outcome = recordTaxAuthorityLastAuthorized(
    {
      tokens: { validToken: async () => token },
      taxAuthority,
      vouchers,
      counts,
      clock: new ManualClock(NOW),
    },
    { pointOfSale: 12, documentType },
  );
  return { taxAuthority, vouchers, counts, outcome };
}

describe("recordTaxAuthorityLastAuthorized", () => {
  it("asks the tax authority for the point of sale's last authorized number and records it with the time it was read", async () => {
    const { taxAuthority, counts, outcome } = record();

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(taxAuthority.lookups).toEqual([{ token: TOKEN, pointOfSale: 12, voucherType: 11 }]);
    expect(counts.stored).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 38,
        issuedOn: "2026-09-30",
        readAt: NOW,
      },
    ]);
  });

  it("asks the tax authority for the voucher of the last authorized number and records the day it was issued on", async () => {
    const { vouchers, counts, outcome } = record();

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(vouchers.lookups).toEqual([
      { token: TOKEN, pointOfSale: 12, voucherType: 11, number: 38 },
    ]);
    expect(counts.stored).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 38,
        issuedOn: "2026-09-30",
        readAt: NOW,
      },
    ]);
  });

  it.each([
    ["has no voucher for it", { kind: "none" }],
    ["gives no answer about it", { kind: "no_answer" }],
  ] satisfies [string, VoucherAnswer][])(
    "records the number with no day when the tax authority %s",
    async (_case, voucher) => {
      const { counts, outcome } = record({ voucher });

      await expect(outcome).resolves.toEqual({ kind: "recorded" });
      expect(counts.stored).toEqual([
        {
          pointOfSale: 12,
          documentType: "factura_c",
          lastAuthorized: 38,
          issuedOn: null,
          readAt: NOW,
        },
      ]);
    },
  );

  it("records a point of sale that never authorized anything as zero, asking for no voucher", async () => {
    const { vouchers, counts, outcome } = record({ answer: { kind: "read", number: 0 } });

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(vouchers.lookups).toEqual([]);
    expect(counts.stored).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 0,
        issuedOn: null,
        readAt: NOW,
      },
    ]);
  });

  it("advances the point of sale's last authorized count with a higher number read", async () => {
    const { counts, outcome } = record({
      stored: [{ pointOfSale: 12, documentType: "factura_c", lastAuthorized: 30, readAt: EARLIER }],
    });

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(counts.stored).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 38,
        issuedOn: "2026-09-30",
        readAt: NOW,
      },
    ]);
  });

  it("never moves the point of sale's last authorized count back when the number read is lower", async () => {
    const { counts, outcome } = record({
      stored: [{ pointOfSale: 12, documentType: "factura_c", lastAuthorized: 44, readAt: EARLIER }],
    });

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(counts.stored).toEqual([
      {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 44,
        issuedOn: "2026-09-30",
        readAt: NOW,
      },
    ]);
  });

  it("leaves the count of another point of sale as it was", async () => {
    const other: LastAuthorizedCount = {
      pointOfSale: 13,
      documentType: "factura_c",
      lastAuthorized: 90,
      readAt: EARLIER,
    };
    const { counts, outcome } = record({ stored: [other] });

    await expect(outcome).resolves.toEqual({ kind: "recorded" });
    expect(counts.stored).toEqual([
      other,
      {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 38,
        issuedOn: "2026-09-30",
        readAt: NOW,
      },
    ]);
  });

  it("asks and records nothing without a valid token", async () => {
    const { taxAuthority, counts, outcome } = record({ token: null });

    await expect(outcome).resolves.toEqual({ kind: "no_token" });
    expect(taxAuthority.lookups).toEqual([]);
    expect(counts.stored).toEqual([]);
  });

  it("records nothing when the tax authority gives no answer", async () => {
    const { vouchers, counts, outcome } = record({ answer: { kind: "no_answer" } });

    await expect(outcome).resolves.toEqual({ kind: "no_answer" });
    expect(vouchers.lookups).toEqual([]);
    expect(counts.stored).toEqual([]);
  });

  describe("for the credit notes of a point of sale", () => {
    it("asks the tax authority for the last authorized credit note C and the voucher of that number", async () => {
      const { taxAuthority, vouchers, counts, outcome } = record({
        documentType: "credit_note_c",
        answer: { kind: "read", number: 9 },
      });

      await expect(outcome).resolves.toEqual({ kind: "recorded" });
      expect(taxAuthority.lookups).toEqual([{ token: TOKEN, pointOfSale: 12, voucherType: 13 }]);
      expect(vouchers.lookups).toEqual([
        { token: TOKEN, pointOfSale: 12, voucherType: 13, number: 9 },
      ]);
      expect(counts.stored).toEqual([
        {
          pointOfSale: 12,
          documentType: "credit_note_c",
          lastAuthorized: 9,
          issuedOn: "2026-09-30",
          readAt: NOW,
        },
      ]);
    });

    it("leaves the factura count of the same point of sale as it was", async () => {
      const factura = {
        pointOfSale: 12,
        documentType: "factura_c",
        lastAuthorized: 44,
        readAt: EARLIER,
      } as const;
      const { counts, outcome } = record({
        documentType: "credit_note_c",
        answer: { kind: "read", number: 9 },
        stored: [factura],
      });

      await expect(outcome).resolves.toEqual({ kind: "recorded" });
      expect(counts.stored).toEqual([
        factura,
        {
          pointOfSale: 12,
          documentType: "credit_note_c",
          lastAuthorized: 9,
          issuedOn: "2026-09-30",
          readAt: NOW,
        },
      ]);
    });

    it("never moves the credit note count back when the number read is lower", async () => {
      const { counts, outcome } = record({
        documentType: "credit_note_c",
        answer: { kind: "read", number: 9 },
        stored: [
          { pointOfSale: 12, documentType: "credit_note_c", lastAuthorized: 20, readAt: EARLIER },
        ],
      });

      await expect(outcome).resolves.toEqual({ kind: "recorded" });
      expect(counts.stored.map(({ lastAuthorized }) => lastAuthorized)).toEqual([20]);
    });
  });
});
