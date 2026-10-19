import { bitlockerRecoveryKeyLoadBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  bitlockerKeyIdentifierMessage,
  bitlockerKeyRequestFrom,
  bitlockerRecoveryKeyMessage,
  EMPTY_BITLOCKER_KEY_FORM,
} from "./bitlocker-key-form";

const KEY = "111111-222222-333333-444444-555555-666666-707707-110000";

test("starts with nothing typed", () => {
  expect(EMPTY_BITLOCKER_KEY_FORM).toEqual({ recoveryKey: "", keyIdentifier: "" });
});

test("builds the request with the typed key and identifier", () => {
  const request = bitlockerKeyRequestFrom({ recoveryKey: KEY, keyIdentifier: "1A2B3C4D" });

  expect(request).toEqual({ recovery_key: KEY, key_identifier: "1A2B3C4D" });
  expect(bitlockerRecoveryKeyLoadBodySchema.safeParse(request).success).toBe(true);
});

test("trims the surrounding spaces of the typed key and identifier", () => {
  expect(
    bitlockerKeyRequestFrom({ recoveryKey: ` ${KEY} `, keyIdentifier: " 1A2B3C4D " }),
  ).toEqual({ recovery_key: KEY, key_identifier: "1A2B3C4D" });
});

test("writes the typed identifier in uppercase", () => {
  expect(bitlockerKeyRequestFrom({ recoveryKey: KEY, keyIdentifier: "1a2b3c4d" })).toEqual({
    recovery_key: KEY,
    key_identifier: "1A2B3C4D",
  });
});

test("a key or identifier typed in another shape is refused by the request's shape", () => {
  expect(
    bitlockerRecoveryKeyLoadBodySchema.safeParse(
      bitlockerKeyRequestFrom({ recoveryKey: "123456", keyIdentifier: "1A2B3C4D" }),
    ).success,
  ).toBe(false);
  expect(
    bitlockerRecoveryKeyLoadBodySchema.safeParse(
      bitlockerKeyRequestFrom({ recoveryKey: KEY, keyIdentifier: "XYZ" }),
    ).success,
  ).toBe(false);
});

test("asks for the key when nothing is typed", () => {
  expect(bitlockerRecoveryKeyMessage({ recoveryKey: "  " })).toBe(
    "Ingresá la clave de 48 dígitos en ocho bloques de seis, separados por guiones.",
  );
});

test("asks to review a typed key that does not fit", () => {
  expect(bitlockerRecoveryKeyMessage({ recoveryKey: "123456" })).toBe(
    "Revisá la clave: son ocho bloques de seis dígitos separados por guiones.",
  );
});

test("asks for the identifier when nothing is typed", () => {
  expect(bitlockerKeyIdentifierMessage({ keyIdentifier: "" })).toBe(
    "Ingresá los 8 caracteres del identificador.",
  );
});

test("asks to review a typed identifier that does not fit", () => {
  expect(bitlockerKeyIdentifierMessage({ keyIdentifier: "XYZ" })).toBe(
    "Revisá el identificador: son 8 caracteres, números del 0 al 9 y letras de la A a la F.",
  );
});
