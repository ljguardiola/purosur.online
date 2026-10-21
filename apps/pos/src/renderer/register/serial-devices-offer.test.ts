import type { OpenCashSession, RegisterStatus } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import type { SignedInPerson } from "../shell/signed-in-person";
import { landsOnSerialDevicesAfterSignIn, serialDevicesOffer } from "./serial-devices-offer";

const CONFIGURER: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_serial_devices"],
};

function statusOffering(serial_devices_setup_offered: boolean): RegisterStatus {
  return {
    conditions: [],
    cloud: "reachable",
    serial_devices: { scale: "matching", reader: "matching" },
    serial_devices_setup_offered,
    fiscal_mode: "real_time",
  };
}

const OFFERED = statusOffering(true);
const NOT_OFFERED = statusOffering(false);
const OPEN_CASH_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-09-30T09:02:00.000-03:00",
  opened_by: CONFIGURER,
  locked: false,
};

describe("landsOnSerialDevicesAfterSignIn", () => {
  function offer({
    offerPending = true,
    readStatus = async (): Promise<RegisterStatus> => OFFERED,
  }: {
    offerPending?: boolean;
    readStatus?: () => Promise<RegisterStatus>;
  } = {}) {
    const settleOffer = vi.fn();
    const read = vi.fn(readStatus);
    return {
      settleOffer,
      read,
      taken: landsOnSerialDevicesAfterSignIn({
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

  it("settles the offer when the core does not offer the devices setup", async () => {
    const { taken, settleOffer } = offer({ readStatus: async () => NOT_OFFERED });

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
  const readNeitherRegistered = async () => OFFERED;

  it("lands on the devices once after a sign-in that leaves no cash session open", async () => {
    const offer = serialDevicesOffer();

    offer.offerSerialDevicesAfterSignIn(null);

    expect(await offer.takeSerialDevicesOffer(readNeitherRegistered)).toBe(true);
    expect(await offer.takeSerialDevicesOffer(readNeitherRegistered)).toBe(false);
  });

  it("does not land on the devices after a sign-in into an open cash session, even once it is closed", async () => {
    const offer = serialDevicesOffer();

    offer.offerSerialDevicesAfterSignIn(OPEN_CASH_SESSION);

    expect(await offer.takeSerialDevicesOffer(readNeitherRegistered)).toBe(false);
  });

  it("lands nowhere before anyone signed in", async () => {
    expect(await serialDevicesOffer().takeSerialDevicesOffer(readNeitherRegistered)).toBe(false);
  });
});
