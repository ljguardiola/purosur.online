import { describe, expectTypeOf, it } from "vitest";
import type { ALERT_KINDS } from "./alert-catalog.js";
import type { AlertDetails, OpenAlertInput } from "./alert-details.js";

describe("AlertDetails", () => {
  it("has an entry for every alert kind", () => {
    expectTypeOf<keyof AlertDetails>().toEqualTypeOf<(typeof ALERT_KINDS)[number]>();
  });
});

describe("OpenAlertInput", () => {
  it("accepts the expiry of the certificate for an expiring-certificate alert", () => {
    expectTypeOf<{
      kind: "arca_certificate_expiring";
      scope: string;
      detail: { notAfter: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device and the version that is no longer accepted for an update-required alert", () => {
    expectTypeOf<{
      kind: "update_required";
      scope: string;
      detail: { deviceId: string; appVersion: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("accepts the device and when it last had a push accepted for a silent-register alert", () => {
    expectTypeOf<{
      kind: "register_silent";
      scope: string;
      locationId: string;
      detail: { deviceId: string; lastAcceptedPushAt: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses a silent-register alert with no last accepted push", () => {
    expectTypeOf<{
      kind: "register_silent";
      scope: string;
      locationId: string;
      detail: { deviceId: string; lastAcceptedPushAt: null };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("accepts the detail of the kind it names", () => {
    expectTypeOf<{
      kind: "user_email_changed";
      scope: string;
      detail: { previousEmail: string; newEmail: string; actorId: string };
    }>().toExtend<OpenAlertInput>();
  });

  it("refuses the detail of another kind", () => {
    expectTypeOf<{
      kind: "user_email_changed";
      scope: string;
      detail: { requestedAt: string; issuedAt: string; expiresAt: string };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses a passkey change that mixes action and route", () => {
    expectTypeOf<{
      kind: "backoffice_passkey_changed";
      scope: string;
      detail: { action: "removed"; passkeyName: string; actorId: string; via: "recovery" };
    }>().not.toExtend<OpenAlertInput>();
  });

  it("refuses an access increase naming a cause without its fields", () => {
    expectTypeOf<{
      kind: "user_access_increased";
      scope: string;
      detail: { cause: "role_assigned"; actorId: string };
    }>().not.toExtend<OpenAlertInput>();
  });
});
