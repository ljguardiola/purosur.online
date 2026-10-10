import type {
  ReadSerialDevicesOutcome,
  RegisterRendererToCoreMessage,
  RegisterSerialDevicesOutcome,
} from "@purosur/contracts";
import type { RegisteredSerialDevices, SerialDeviceIdentity } from "@purosur/domain";
import {
  readSerialDevices,
  registerSerialDevices,
  type SerialDeviceEnumeration,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate, SignedInActor } from "../sessions/action-gate";
import { SqliteSerialDeviceRegistrations } from "./sqlite-serial-device-registrations";

export interface ReadSerialDevicesRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  enumeration: SerialDeviceEnumeration;
}

export interface RegisterSerialDevicesRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  recheck: () => Promise<void>;
}

type Refusal = { kind: "not_signed_in" } | { kind: "lacks_permission" };

type WireIdentity = { vendor_id: string; product_id: string };
export type WireSerialDevices = Extract<
  RegisterRendererToCoreMessage,
  { type: "register-serial-devices" }
>["devices"];

function authorityOf(gate: ActionGate) {
  return {
    async authorize() {
      const guarded = await gate.run(
        { kind: "configure_serial_devices" },
        async (actor): Promise<SignedInActor> => actor,
      );
      return guarded.kind === "performed"
        ? ({ kind: "granted", grant: guarded.result } as const)
        : ({ kind: "refused", refusal: guarded satisfies Refusal } as const);
    },
  };
}

function wireIdentityOf({ vendorId, productId }: SerialDeviceIdentity): WireIdentity {
  return { vendor_id: vendorId, product_id: productId };
}

function identityOf({ vendor_id, product_id }: WireIdentity): SerialDeviceIdentity {
  return { vendorId: vendor_id, productId: product_id };
}

function wireDevicesOf(devices: RegisteredSerialDevices): WireSerialDevices {
  return {
    ...(devices.scale === undefined ? {} : { scale: wireIdentityOf(devices.scale) }),
    ...(devices.reader === undefined ? {} : { reader: wireIdentityOf(devices.reader) }),
  };
}

function devicesOf(devices: WireSerialDevices): RegisteredSerialDevices {
  return {
    ...(devices.scale === undefined ? {} : { scale: identityOf(devices.scale) }),
    ...(devices.reader === undefined ? {} : { reader: identityOf(devices.reader) }),
  };
}

export async function readSerialDevicesFor({
  database,
  gate,
  enumeration,
}: ReadSerialDevicesRequestDeps): Promise<ReadSerialDevicesOutcome> {
  const outcome = await readSerialDevices({
    registrations: new SqliteSerialDeviceRegistrations(database),
    enumeration,
    authority: authorityOf(gate),
  });
  if (outcome.kind !== "read") {
    return outcome;
  }
  return {
    kind: "read",
    registered: wireDevicesOf(outcome.registered),
    detected: outcome.detected.map(({ path, identity }) => ({ path, ...wireIdentityOf(identity) })),
    standings: outcome.standings,
  };
}

export async function registerSerialDevicesFor(
  { database, gate, recheck }: RegisterSerialDevicesRequestDeps,
  devices: WireSerialDevices,
): Promise<RegisterSerialDevicesOutcome> {
  const outcome = await registerSerialDevices(
    { registrations: new SqliteSerialDeviceRegistrations(database), authority: authorityOf(gate) },
    { devices: devicesOf(devices) },
  );
  if (outcome.kind !== "registered") {
    return outcome;
  }
  await recheck();
  return { kind: "registered", devices: wireDevicesOf(outcome.devices) };
}
