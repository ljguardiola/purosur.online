import { describe, expect, it } from "vitest";
import { isSameAlertDetail } from "./alert-detail-equality.js";

const REJECTED = {
  pointOfSale: 3,
  fiscalDocumentId: "document-1",
  rejections: [
    { code: 10015, message: "Rechazado" },
    { code: 10016, message: "Rechazado otra vez" },
  ],
};

describe("isSameAlertDetail", () => {
  it("finds a detail with the same members the same, whatever order they are written in", () => {
    expect(
      isSameAlertDetail(
        { deviceId: "device-1", reason: "legal_name_missing" },
        { reason: "legal_name_missing", deviceId: "device-1" },
      ),
    ).toBe(true);
  });

  it("finds a detail with the same nested lists and members the same", () => {
    expect(isSameAlertDetail(REJECTED, structuredClone(REJECTED))).toBe(true);
  });

  it("finds a detail with a member of another value different", () => {
    expect(
      isSameAlertDetail(
        { deviceId: "device-1", reason: "legal_name_missing" },
        { deviceId: "device-1", reason: "issuer_identification_missing" },
      ),
    ).toBe(false);
  });

  it("finds a detail with a member the other lacks different, either way round", () => {
    const fewer = { deviceId: "device-1" };
    const more = { deviceId: "device-1", reason: "legal_name_missing" };

    expect(isSameAlertDetail(fewer, more)).toBe(false);
    expect(isSameAlertDetail(more, fewer)).toBe(false);
  });

  it("finds a detail whose member names differ different, even with as many members", () => {
    expect(isSameAlertDetail({ deviceId: "device-1" }, { appVersion: "device-1" })).toBe(false);
  });

  it("finds a detail with a nested member of another value different", () => {
    const changed = structuredClone(REJECTED);
    changed.rejections[1] = { code: 10016, message: "Otro motivo" };

    expect(isSameAlertDetail(REJECTED, changed)).toBe(false);
  });

  it("finds a detail with a list of another length different, either way round", () => {
    const shorter = { ...REJECTED, rejections: REJECTED.rejections.slice(0, 1) };

    expect(isSameAlertDetail(REJECTED, shorter)).toBe(false);
    expect(isSameAlertDetail(shorter, REJECTED)).toBe(false);
  });

  it("finds a list different from a member set holding the same values and length, either way round", () => {
    const list = { values: ["a"] };
    const members = { values: { 0: "a", length: 1 } };

    expect(isSameAlertDetail(list, members)).toBe(false);
    expect(isSameAlertDetail(members, list)).toBe(false);
  });

  it("finds a missing value different from an empty member set, either way round", () => {
    expect(isSameAlertDetail({ reason: null }, { reason: {} })).toBe(false);
    expect(isSameAlertDetail({ reason: {} }, { reason: null })).toBe(false);
  });

  it("finds a number different from the same digits written as text", () => {
    expect(isSameAlertDetail({ pointOfSale: 3 }, { pointOfSale: "3" })).toBe(false);
  });
});
