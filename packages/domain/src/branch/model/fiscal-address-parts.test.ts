import { describe, expect, it } from "vitest";
import { fiscalAddressAt, fiscalAddressPartsOf } from "./fiscal-address-parts.js";

const at = (time: string) => new Date(`2026-10-01T${time}:00.000Z`);

describe("fiscalAddressPartsOf", () => {
  it("keeps the whole interval at the only address the register ever had", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("11:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
      ]),
    ).toEqual([{ fiscalAddressId: "address-a", start: at("10:00"), end: at("11:00") }]);
  });

  it("splits an interval at the moment the register moved to another address", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("12:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
        { assignedAt: at("11:00"), fiscalAddressId: "address-b" },
      ]),
    ).toEqual([
      { fiscalAddressId: "address-a", start: at("10:00"), end: at("11:00") },
      { fiscalAddressId: "address-b", start: at("11:00"), end: at("12:00") },
    ]);
  });

  it("splits an interval across several moves, returning to an earlier address", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("14:00") }, [
        { assignedAt: at("08:00"), fiscalAddressId: "address-a" },
        { assignedAt: at("11:00"), fiscalAddressId: "address-b" },
        { assignedAt: at("12:00"), fiscalAddressId: "address-a" },
      ]),
    ).toEqual([
      { fiscalAddressId: "address-a", start: at("10:00"), end: at("11:00") },
      { fiscalAddressId: "address-b", start: at("11:00"), end: at("12:00") },
      { fiscalAddressId: "address-a", start: at("12:00"), end: at("14:00") },
    ]);
  });

  it("leaves out the addresses the register had only before or after the interval", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("11:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
        { assignedAt: at("09:00"), fiscalAddressId: "address-b" },
        { assignedAt: at("12:00"), fiscalAddressId: "address-c" },
      ]),
    ).toEqual([{ fiscalAddressId: "address-b", start: at("10:00"), end: at("11:00") }]);
  });

  it("belongs to the new address from the very moment of the move", () => {
    expect(
      fiscalAddressPartsOf({ start: at("11:00"), end: at("12:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
        { assignedAt: at("11:00"), fiscalAddressId: "address-b" },
      ]),
    ).toEqual([{ fiscalAddressId: "address-b", start: at("11:00"), end: at("12:00") }]);
  });

  it("leaves out an address the register left at the very moment the interval started", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("11:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
        { assignedAt: at("10:00"), fiscalAddressId: "address-b" },
      ]),
    ).toEqual([{ fiscalAddressId: "address-b", start: at("10:00"), end: at("11:00") }]);
  });

  it("leaves out an address the register only reached at the very moment the interval ended", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("11:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
        { assignedAt: at("11:00"), fiscalAddressId: "address-b" },
      ]),
    ).toEqual([{ fiscalAddressId: "address-a", start: at("10:00"), end: at("11:00") }]);
  });

  it("keeps an open interval's last part open", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: null }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
        { assignedAt: at("11:00"), fiscalAddressId: "address-b" },
      ]),
    ).toEqual([
      { fiscalAddressId: "address-a", start: at("10:00"), end: at("11:00") },
      { fiscalAddressId: "address-b", start: at("11:00"), end: null },
    ]);
  });

  it("keeps an open interval open at the only address", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: null }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
      ]),
    ).toEqual([{ fiscalAddressId: "address-a", start: at("10:00"), end: null }]);
  });

  it("has no part for an interval before the register's first address", () => {
    expect(
      fiscalAddressPartsOf({ start: at("08:00"), end: at("09:00") }, [
        { assignedAt: at("10:00"), fiscalAddressId: "address-a" },
      ]),
    ).toEqual([]);
  });

  it("has no part for an interval of no duration", () => {
    expect(
      fiscalAddressPartsOf({ start: at("10:00"), end: at("10:00") }, [
        { assignedAt: null, fiscalAddressId: "address-a" },
      ]),
    ).toEqual([]);
  });

  it("has no part when the register never had an address", () => {
    expect(fiscalAddressPartsOf({ start: at("10:00"), end: at("11:00") }, [])).toEqual([]);
  });
});

describe("fiscalAddressAt", () => {
  const history = [
    { assignedAt: at("09:00"), fiscalAddressId: "address-a" },
    { assignedAt: at("11:00"), fiscalAddressId: "address-b" },
  ];

  it("belongs to the address the register reached at that very instant", () => {
    expect(fiscalAddressAt(at("11:00"), history)).toBe("address-b");
  });

  it("belongs to the address the register had between two moves", () => {
    expect(fiscalAddressAt(at("10:00"), history)).toBe("address-a");
  });

  it("belongs to the latest address once the register stopped moving", () => {
    expect(fiscalAddressAt(at("12:00"), history)).toBe("address-b");
  });

  it("belongs to no address before the register's first address", () => {
    expect(fiscalAddressAt(at("08:00"), history)).toBeNull();
  });

  it("belongs to the address the register has had since ever", () => {
    expect(fiscalAddressAt(at("08:00"), [{ assignedAt: null, fiscalAddressId: "address-a" }])).toBe(
      "address-a",
    );
  });

  it("belongs to no address when the register never had one", () => {
    expect(fiscalAddressAt(at("10:00"), [])).toBeNull();
  });
});
