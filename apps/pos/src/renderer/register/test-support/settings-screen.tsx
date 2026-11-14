import type {
  ReadReceiptPrinterOutcome,
  ReadSerialDevicesOutcome,
  RegisterSerialDevicesOutcome,
  RegisterStatus,
  SetReceiptPrinterOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import type { SerialDevicesToRegister } from "../../platform/core-client";
import type { RegisterStatusData } from "../../shell/register-status-context";
import { RegisterStatusProvider } from "../../shell/register-status-context";
import type { SignedInPerson } from "../../shell/signed-in-person";
import { render } from "../../shell/test-support/render-with-router";
import { SettingsScreen } from "../settings-screen";
import type { SettingsSection } from "../settings-sections";

export const PRINTER_CONFIGURER: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_receipt_printer"],
};
export const DEVICES_CONFIGURER: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_serial_devices"],
};
export const BOTH_CONFIGURER: SignedInPerson = {
  user_id: "u1",
  first_name: "Linus",
  abilities: ["configure_receipt_printer", "configure_serial_devices"],
};
export const NO_CONFIGURER: SignedInPerson = { user_id: "u1", first_name: "Linus", abilities: [] };

export const NOT_CONFIGURED: ReadReceiptPrinterOutcome = { kind: "not_configured" };
export const CONFIGURED: ReadReceiptPrinterOutcome = {
  kind: "configured",
  address: { host: "10.10.10.2", port: 9100 },
};
export const SAVED: SetReceiptPrinterOutcome = {
  kind: "saved",
  address: { host: "10.10.10.9", port: 9101 },
};

export const SCALE_IDENTITY = { vendor_id: "0403", product_id: "6001" };
export const READER_IDENTITY = { vendor_id: "05e0", product_id: "1200" };
export const DETECTED = [
  { path: "COM3", ...SCALE_IDENTITY },
  { path: "COM4", ...READER_IDENTITY },
];
export const NOTHING_REGISTERED: ReadSerialDevicesOutcome = {
  kind: "read",
  registered: {},
  detected: DETECTED,
  standings: { scale: { kind: "not_registered" }, reader: { kind: "not_registered" } },
};
export const BOTH_REGISTERED: ReadSerialDevicesOutcome = {
  kind: "read",
  registered: { scale: SCALE_IDENTITY, reader: READER_IDENTITY },
  detected: DETECTED,
  standings: {
    scale: { kind: "matching", path: "COM3" },
    reader: { kind: "matching", path: "COM4" },
  },
};
export const REGISTERED: RegisterSerialDevicesOutcome = {
  kind: "registered",
  devices: { scale: SCALE_IDENTITY },
};

type Standings = RegisterStatus["serial_devices"];

function registerStatus(person: SignedInPerson, standings: Standings): RegisterStatusData {
  return {
    person,
    registerName: "Caja 1",
    cashSession: { status: "none" },
    status: {
      status: "loaded",
      value: {
        conditions: [],
        cloud: "reachable",
        serial_devices: standings,
        serial_devices_setup_offered: false,
        contingency: null,
      },
      refreshing: false,
    },
    backupTickets: { status: "loading" },
    onDiscardBackupTickets: () => {},
  };
}

export type SettingsOptions = {
  person?: SignedInPerson;
  section?: SettingsSection;
  offered?: boolean;
  sessionOpen?: boolean;
  standings?: Standings;
  readPrinter?: () => Promise<ReadReceiptPrinterOutcome>;
  setPrinter?: (address: string) => Promise<SetReceiptPrinterOutcome>;
  readDevices?: () => Promise<ReadSerialDevicesOutcome>;
  registerDevices?: (devices: SerialDevicesToRegister) => Promise<RegisterSerialDevicesOutcome>;
};

export async function renderSettings({
  person = BOTH_CONFIGURER,
  section,
  offered = false,
  sessionOpen = false,
  standings = { scale: "not_registered", reader: "not_registered" },
  readPrinter = async () => NOT_CONFIGURED,
  setPrinter = async () => SAVED,
  readDevices = async () => NOTHING_REGISTERED,
  registerDevices = async () => REGISTERED,
}: SettingsOptions = {}) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  const readReceiptPrinter = vi.fn(readPrinter);
  const setReceiptPrinter = vi.fn(setPrinter);
  const readSerialDevices = vi.fn(readDevices);
  const registerSerialDevices = vi.fn(registerDevices);
  const onSessionInvalid = vi.fn();
  const onSelectSection = vi.fn();
  const screen = await render(
    <RegisterStatusProvider value={registerStatus(person, standings)}>
      <SettingsScreen
        person={person}
        sessionOpen={sessionOpen}
        signOut={vi.fn()}
        {...(section === undefined ? {} : { section })}
        offered={offered}
        onSelectSection={onSelectSection}
        readReceiptPrinter={readReceiptPrinter}
        setReceiptPrinter={setReceiptPrinter}
        readSerialDevices={readSerialDevices}
        registerSerialDevices={registerSerialDevices}
        onSessionInvalid={onSessionInvalid}
      />
    </RegisterStatusProvider>,
  );
  return {
    screen,
    readReceiptPrinter,
    setReceiptPrinter,
    readSerialDevices,
    registerSerialDevices,
    onSessionInvalid,
    onSelectSection,
  };
}

export type RenderedSettings = Awaited<ReturnType<typeof renderSettings>>;
type Screen = RenderedSettings["screen"];

export function appartadosCard(screen: Screen) {
  return screen.getByRole("region", { name: "APARTADOS" });
}

export function panelOf(screen: Screen, name: string) {
  return screen.getByRole("complementary", { name });
}

export function legendOf(screen: Screen): string[] {
  return appartadosCard(screen)
    .getByRole("listitem")
    .elements()
    .filter((item) => item.querySelector("kbd") !== null)
    .map((item) => item.textContent.trim());
}
