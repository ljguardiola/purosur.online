import type { OperationAuthority } from "../../shared/index.js";
import {
  isSameSerialDeviceIdentity,
  type RegisteredSerialDevices,
} from "../model/serial-devices.js";
import type { SerialDeviceRegistrations } from "./serial-device-registrations.js";

export interface RegisterSerialDevicesPorts<Grant, Refusal> {
  registrations: SerialDeviceRegistrations;
  authority: OperationAuthority<Grant, Refusal>;
}

export interface RegisterSerialDevicesInput {
  devices: RegisteredSerialDevices;
}

export type RegisterSerialDevicesOutcome =
  | { kind: "registered"; devices: RegisteredSerialDevices }
  | { kind: "same_identity_for_both" };

export async function registerSerialDevices<Grant, Refusal>(
  { registrations, authority }: RegisterSerialDevicesPorts<Grant, Refusal>,
  { devices }: RegisterSerialDevicesInput,
): Promise<RegisterSerialDevicesOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const current = registrations.registeredSerialDevices();
  const scale = devices.scale ?? current.scale;
  const reader = devices.reader ?? current.reader;
  if (scale !== undefined && reader !== undefined && isSameSerialDeviceIdentity(scale, reader)) {
    return { kind: "same_identity_for_both" };
  }
  const merged: RegisteredSerialDevices = {
    ...(scale === undefined ? {} : { scale }),
    ...(reader === undefined ? {} : { reader }),
  };
  registrations.saveSerialDevices(merged);
  return { kind: "registered", devices: merged };
}
