import type { OpenCashSession, RegisterStatus } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import type { SignedInPerson } from "../shell/signed-in-person";
import {
  landsOnSerialDevices,
  landsOnSerialDevicesAfterSignIn,
  serialDevicesOffer,
} from "./serial-devices-offer";

const CONFIGURER: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_serial_devices"],
};
const CASHIER: SignedInPerson = {
  user_id: "u2",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};

function statusWith(serial_devices: RegisterStatus["serial_devices"]): RegisterStatus {
  return { conditions: [], cloud: "reachable", serial_devices };
}

const NEITHER_REGISTERED = statusWith({ scale: "not_registered", reader: "not_registered" });
const OPEN_CASH_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-09-30T09:02:00.000-03:00",
  opened_by: CONFIGURER,
  locked: false,
};

describe("landsOnSerialDevices", () => {
  it("lands a person who may configure the devices on them while neither is registered", () => {
    expect(landsOnSerialDevices({ person: CONFIGURER, status: NEITHER_REGISTERED })).toBe(true);
  });

  it.each([
    statusWith({ scale: "matching", reader: "not_registered" }),
    statusWith({ scale: "not_registered", reader: "not_detected" }),
    statusWith({ scale: "mismatched", reader: "matching" }),
    statusWith({ scale: "matching", reader: "matching" }),
  ])("does not land on them once either is registered: %j", (status) => {
    expect(landsOnSerialDevices({ person: CONFIGURER, status })).toBe(false);
  });

  it("does not land a person who may not configure the devices", () => {
    expect(landsOnSerialDevices({ person: CASHIER, status: NEITHER_REGISTERED })).toBe(false);
  });

  it("does not land anyone while the status is not known", () => {
    expect(landsOnSerialDevices({ person: CONFIGURER, status: undefined })).toBe(false);
  });
});

describe("landsOnSerialDevicesAfterSignIn", () => {
  function offer({
    person = CONFIGURER,
    offerPending = true,
    readStatus = async (): Promise<RegisterStatus> => NEITHER_REGISTERED,
  }: {
    person?: SignedInPerson;
    offerPending?: boolean;
    readStatus?: () => Promise<RegisterStatus>;
  } = {}) {
    const settleOffer = vi.fn();
    const read = vi.fn(readStatus);
    return {
      settleOffer,
      read,
      taken: landsOnSerialDevicesAfterSignIn({
        person,
        offerPending,
        settleOffer,
        readStatus: read,
      }),
    };
  }

  it("lands on the devices once, settling the offer made at sign-in", async () => {
    const { taken, settleOffer } = offer();

    expect(await taken).toBe(true);
    expect(settleOffer).toHaveBeenCalledOnce();
  });

  it("lands nowhere and reads nothing when no offer is pending", async () => {
    const { taken, settleOffer, read } = offer({ offerPending: false });

    expect(await taken).toBe(false);
    expect(settleOffer).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("settles the offer without reading the status for a person who may not configure the devices", async () => {
    const { taken, settleOffer, read } = offer({ person: CASHIER });

    expect(await taken).toBe(false);
    expect(settleOffer).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it("settles the offer when the devices need no setup", async () => {
    const { taken, settleOffer } = offer({
      readStatus: async () => statusWith({ scale: "matching", reader: "not_registered" }),
    });

    expect(await taken).toBe(false);
    expect(settleOffer).toHaveBeenCalledOnce();
  });

  it("settles the offer when the status cannot be read", async () => {
    const { taken, settleOffer } = offer({
      readStatus: async () => {
        throw new Error("the core did not answer");
      },
    });

    expect(await taken).toBe(false);
    expect(settleOffer).toHaveBeenCalledOnce();
  });
});

describe("serialDevicesOffer", () => {
  const readNeitherRegistered = async () => NEITHER_REGISTERED;

  it("lands on the devices once after a sign-in that leaves no cash session open", async () => {
    const offer = serialDevicesOffer();

    offer.offerSerialDevicesAfterSignIn(null);

    expect(await offer.takeSerialDevicesOffer(CONFIGURER, readNeitherRegistered)).toBe(true);
    expect(await offer.takeSerialDevicesOffer(CONFIGURER, readNeitherRegistered)).toBe(false);
  });

  it("does not land on the devices after a sign-in into an open cash session, even once it is closed", async () => {
    const offer = serialDevicesOffer();

    offer.offerSerialDevicesAfterSignIn(OPEN_CASH_SESSION);

    expect(await offer.takeSerialDevicesOffer(CONFIGURER, readNeitherRegistered)).toBe(false);
  });

  it("lands nowhere before anyone signed in", async () => {
    expect(
      await serialDevicesOffer().takeSerialDevicesOffer(CONFIGURER, readNeitherRegistered),
    ).toBe(false);
  });
});
