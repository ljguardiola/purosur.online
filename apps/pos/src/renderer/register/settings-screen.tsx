import type {
  ReadReceiptPrinterOutcome,
  ReadSerialDevicesOutcome,
  RegisterSerialDevicesOutcome,
  SetReceiptPrinterOutcome,
} from "@purosur/contracts";
import type { SectionListItem } from "@purosur/ui";
import { plural } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Laptop, Printer, Usb } from "lucide-react";
import type { SerialDevicesToRegister } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import type { CoreData } from "../platform/use-core-query";
import { cloudStanding } from "../shell/cloud-standing";
import { registerNoticeSummary } from "../shell/register-notices";
import { useRegisterStatusData } from "../shell/register-status-context";
import type { SignedInPerson } from "../shell/signed-in-person";
import { DevicesSettings } from "./devices-settings";
import { PrinterSettings } from "./printer-settings";
import { receiptPrinterAddressText } from "./receipt-printer-form";
import type { ShownReceiptPrinter } from "./register-queries";
import { useReceiptPrinterQuery, useRegisterVersionQuery } from "./register-queries";
import { serialDeviceStandingIndicator } from "./serial-device-standing";
import type { SettingsSection } from "./settings-sections";
import { sectionToShow, shownSections } from "./settings-sections";
import { ThisRegisterSettings } from "./this-register-settings";

export type SettingsScreenProps = {
  person: SignedInPerson;
  sessionOpen: boolean;
  signOut: () => void;
  section?: SettingsSection;
  offered: boolean;
  onSelectSection: (section: SettingsSection) => void;
  readReceiptPrinter: () => Promise<ReadReceiptPrinterOutcome>;
  setReceiptPrinter: (address: string) => Promise<SetReceiptPrinterOutcome>;
  readSerialDevices: () => Promise<ReadSerialDevicesOutcome>;
  registerSerialDevices: (
    devices: SerialDevicesToRegister,
  ) => Promise<RegisterSerialDevicesOutcome>;
  readRegisterVersion: () => Promise<string | null>;
  onSessionInvalid: () => void;
};

function registerStatuses(
  data: ReturnType<typeof useRegisterStatusData>,
): SectionListItem["statuses"] {
  if (data?.status.status !== "loaded") {
    return [];
  }
  const { conditions, contingency, cloud } = data.status.value;
  const { count } = registerNoticeSummary({
    conditions,
    contingency,
    backupTickets: data.backupTickets.status === "loaded" ? data.backupTickets.value : undefined,
  });
  return [
    cloudStanding(cloud),
    ...(count > 0
      ? [
          {
            tone: "warning" as const,
            text: `${count} ${plural(count, { one: "aviso", other: "avisos" })}`,
          },
        ]
      : []),
  ];
}

function printerStatuses(printer: CoreData<ShownReceiptPrinter>): SectionListItem["statuses"] {
  if (printer.status !== "loaded") {
    return [];
  }
  if (printer.value.kind === "configured") {
    return [{ tone: "success", text: receiptPrinterAddressText(printer.value.address) }];
  }
  return printer.value.kind === "not_configured"
    ? [{ tone: "warning", text: "Sin configurar" }]
    : [];
}

export function SettingsScreen({
  person,
  sessionOpen,
  signOut,
  section,
  offered,
  onSelectSection,
  readReceiptPrinter,
  setReceiptPrinter,
  readSerialDevices,
  registerSerialDevices,
  readRegisterVersion,
  onSessionInvalid,
}: SettingsScreenProps) {
  const navigate = useNavigate();
  const registerData = useRegisterStatusData();
  const registerStatus = registerData?.status;
  const version = useRegisterVersionQuery(readRegisterVersion);
  const printer = useReceiptPrinterQuery(readReceiptPrinter);
  const shown = shownSections(person.abilities);
  const selected = sectionToShow(shown, section);
  const skipOffer = offered && selected === "devices";

  function leave() {
    void navigate({ to: sessionOpen ? "/session" : "/" });
  }

  function skip() {
    void navigate({ to: "/" });
  }

  useKeys([{ key: "Escape", run: skip }], { fallback: true, active: skipOffer });

  const itemOf: Record<SettingsSection, SectionListItem> = {
    printer: {
      id: "printer",
      icon: <Printer />,
      title: "Impresora",
      statuses: printerStatuses(printer),
    },
    devices: {
      id: "devices",
      icon: <Usb />,
      title: "Balanza y lector",
      statuses:
        registerStatus?.status === "loaded"
          ? (["scale", "reader"] as const).map((role) =>
              serialDeviceStandingIndicator(role, registerStatus.value.serial_devices[role]),
            )
          : [],
    },
    register: {
      id: "register",
      icon: <Laptop />,
      title: "Esta caja",
      statuses: registerStatuses(registerData),
    },
  };

  function select(id: string) {
    const chosen = shown.find((candidate) => candidate === id);
    if (chosen !== undefined) {
      onSelectSection(chosen);
    }
  }

  function moveSection(pressed: string) {
    const at = selected === undefined ? -1 : shown.indexOf(selected);
    const next = shown[pressed === "ArrowUp" ? at - 1 : at + 1];
    if (next !== undefined) {
      onSelectSection(next);
    }
  }

  const chrome = {
    person,
    sessionOpen,
    signOut,
    items: shown.map((id) => itemOf[id]),
    selected,
    onSelect: select,
    moveSection,
  };

  if (selected === "printer") {
    return (
      <PrinterSettings
        chrome={chrome}
        onClose={leave}
        printer={printer}
        setReceiptPrinter={setReceiptPrinter}
        onSessionInvalid={onSessionInvalid}
      />
    );
  }
  if (selected === "devices") {
    return (
      <DevicesSettings
        chrome={chrome}
        onClose={skipOffer ? skip : leave}
        closeLabel={skipOffer ? "Ahora no" : undefined}
        readSerialDevices={readSerialDevices}
        registerSerialDevices={registerSerialDevices}
        onSessionInvalid={onSessionInvalid}
      />
    );
  }
  return <ThisRegisterSettings chrome={chrome} onClose={leave} version={version} />;
}
