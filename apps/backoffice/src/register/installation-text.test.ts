import { expect, test } from "vitest";
import { installationLines } from "./installation-text";

test("has no lines for a register never enrolled", () => {
  expect(installationLines(null)).toBeNull();
});

test("tells when an enrolled register enrolled and on which Windows version", () => {
  expect(
    installationLines({
      state: "enrolled",
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: "2026-08-01T15:00:00.000Z",
    }),
  ).toEqual({
    primary: "Dada de alta el 01/08/2026",
    secondary: "Windows 11 Pro 10.0.26100",
  });
});

test("tells when a revoked installation was revoked and which machine it ran on", () => {
  expect(
    installationLines({
      state: "revoked",
      hostname: "CAJA-DEPOSITO",
      windowsVersion: "Windows 10 Pro 10.0.19045",
      enrolledAt: "2026-08-01T15:00:00.000Z",
      revokedAt: "2026-08-03T18:30:00.000Z",
    }),
  ).toEqual({
    primary: "Revocada el 03/08/2026",
    secondary: "CAJA-DEPOSITO · Windows 10 Pro 10.0.19045",
  });
});

test("dates an installation's instants in Argentina's time zone", () => {
  expect(
    installationLines({
      state: "revoked",
      hostname: "CAJA-DEPOSITO",
      windowsVersion: "Windows 10 Pro 10.0.19045",
      enrolledAt: "2026-08-02T02:59:00.000Z",
      revokedAt: "2026-08-04T03:00:00.000Z",
    })?.primary,
  ).toBe("Revocada el 04/08/2026");
  expect(
    installationLines({
      state: "enrolled",
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
      enrolledAt: "2026-08-02T02:59:00.000Z",
    })?.primary,
  ).toBe("Dada de alta el 01/08/2026");
});
