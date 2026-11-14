import type {
  ContingencyBackupTicketsAnswer,
  ReadReceiptPrinterOutcome,
  ReadSerialDevicesOutcome,
  RegisterSerialDevicesOutcome,
  RegisterStatus,
  SetReceiptPrinterOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import type { SerialDevicesToRegister } from "../../platform/core-client";
import type { CoreData } from "../../platform/use-core-query";
import type { RegisterStatusData } from "../../shell/register-status-context";
import { RegisterStatusProvider } from "../../shell/register-status-context";
import type { SignedInPerson } from "../../shell/signed-in-person";
import { backupTickets as backupTicketsAnswer } from "../../shell/test-support/contingency-backup-tickets";
import { render } from "../../shell/test-support/render-with-router";
import type { CashSessionState } from "../cash-session-state";
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

const NOT_CONFIGURED: ReadReceiptPrinterOutcome = { kind: "not_configured" };
export const CONFIGURED: ReadReceiptPrinterOutcome = {
  kind: "configured",
  address: { host: "10.10.10.2", port: 9100 },
};
const SAVED: SetReceiptPrinterOutcome = {
  kind: "saved",
  address: { host: "10.10.10.9", port: 9101 },
};

export const SCALE_IDENTITY = { vendor_id: "0403", product_id: "6001" };
export const READER_IDENTITY = { vendor_id: "05e0", product_id: "1200" };
const DETECTED = [
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
const REGISTERED: RegisterSerialDevicesOutcome = {
  kind: "registered",
  devices: { scale: SCALE_IDENTITY },
};

type Standings = RegisterStatus["serial_devices"];

type RegisterStatusOptions = {
  person: SignedInPerson;
  standings: Standings;
  status: Partial<RegisterStatus>;
  cashSession: CashSessionState;
  backupTickets: CoreData<ContingencyBackupTicketsAnswer>;
  onDiscardBackupTickets: () => void;
};

function registerStatus({
  person,
  standings,
  status,
  cashSession,
  backupTickets,
  onDiscardBackupTickets,
}: RegisterStatusOptions): RegisterStatusData {
  return {
    person,
    registerName: "Caja 1",
    cashSession,
    status: {
      status: "loaded",
      value: {
        conditions: [],
        cloud: "reachable",
        serial_devices: standings,
        serial_devices_setup_offered: false,
        contingency: null,
        ...status,
      },
      refreshing: false,
    },
    backupTickets,
    onDiscardBackupTickets,
  };
}

export const OPEN_SESSION: CashSessionState = {
  status: "open",
  id: "s1",
  openedAt: "2026-11-14T08:02:00.000-03:00",
  openedBy: { user_id: "u1", first_name: "Linus", abilities: [] },
  locked: false,
};

export const CLOCK_DRIFT = {
  kind: "clock_drift",
  level: "warning",
  since: "2026-11-04T14:20:00.000-03:00",
} as const;
export const REGISTER_SILENT = {
  kind: "register_silent",
  level: "critical",
  since: "2026-11-04T13:05:00.000-03:00",
} as const;

export function loadedBackupTickets(
  tickets: Partial<ContingencyBackupTicketsAnswer> = {},
): CoreData<ContingencyBackupTicketsAnswer> {
  return { status: "loaded", value: backupTicketsAnswer(tickets), refreshing: false };
}

export type SettingsOptions = {
  person?: SignedInPerson;
  section?: SettingsSection;
  offered?: boolean;
  sessionOpen?: boolean;
  standings?: Standings;
  status?: Partial<RegisterStatus>;
  cashSession?: CashSessionState;
  backupTickets?: CoreData<ContingencyBackupTicketsAnswer>;
  version?: string | null;
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
  status = {},
  cashSession = { status: "none" },
  backupTickets = { status: "loading" },
  version = "1.4.212",
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
  const onDiscardBackupTickets = vi.fn();
  const settings = (shown: Pick<RegisterStatusOptions, "status" | "backupTickets">) => (
    <RegisterStatusProvider
      value={registerStatus({
        person,
        standings,
        cashSession,
        onDiscardBackupTickets,
        ...shown,
      })}
    >
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
        readRegisterVersion={async () => version}
        onSessionInvalid={onSessionInvalid}
      />
    </RegisterStatusProvider>
  );
  const screen = await render(settings({ status, backupTickets }));
  return {
    screen,
    showRegisterStatus: (shown: Pick<RegisterStatusOptions, "status" | "backupTickets">) =>
      screen.rerender(settings(shown)),
    readReceiptPrinter,
    setReceiptPrinter,
    readSerialDevices,
    registerSerialDevices,
    onSessionInvalid,
    onSelectSection,
    onDiscardBackupTickets,
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

export function noticesList(screen: Screen) {
  return panelOf(screen, "Esta caja").getByRole("list", { name: "Avisos de esta caja" });
}

export function panelLegendOf(screen: Screen): string[] {
  return panelOf(screen, "Esta caja")
    .getByRole("listitem")
    .elements()
    .filter((item) => item.querySelector("kbd") !== null)
    .map((item) => item.textContent.trim());
}

export function iconBeside(text: Element): string {
  let around: Element | null = text;
  while (around !== null && around.querySelector("svg") === null) {
    around = around.parentElement;
  }
  return around?.querySelector("svg")?.getAttribute("class") ?? "";
}
