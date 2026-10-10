import type { RegisterStatus } from "@purosur/contracts";
import type { Tone } from "@purosur/ui";

export type SerialDeviceRole = keyof RegisterStatus["serial_devices"];

export type SerialDeviceStandingKind = RegisterStatus["serial_devices"][SerialDeviceRole];

type Indicator = { tone: Tone; text: string };

const ROLE_TEXTS: Record<SerialDeviceRole, Record<SerialDeviceStandingKind, string>> = {
  scale: {
    matching: "Balanza conectada",
    not_detected: "Balanza no detectada",
    mismatched: "Balanza no coincide con la registrada",
    not_registered: "Balanza sin registrar",
    unknown: "Balanza sin verificar",
  },
  reader: {
    matching: "Lector conectado",
    not_detected: "Lector no detectado",
    mismatched: "Lector no coincide con el registrado",
    not_registered: "Lector sin registrar",
    unknown: "Lector sin verificar",
  },
};

const TONES: Record<SerialDeviceStandingKind, Tone> = {
  matching: "success",
  not_detected: "error",
  mismatched: "error",
  not_registered: "neutral",
  unknown: "neutral",
};

export function serialDeviceStandingIndicator(
  role: SerialDeviceRole,
  standing: SerialDeviceStandingKind,
): Indicator {
  return { tone: TONES[standing], text: ROLE_TEXTS[role][standing] };
}
